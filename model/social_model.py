"""
SocialMediaModel — main Mesa model for the Algorithmic Echo Chambers ABM.

Simulation flow each step
-------------------------
1. Creators generate content → content_pool
2. Algorithm ranks content for each user → personalised feed
3. Users consume feed, evaluate each item, update beliefs, reshare
4. Reshared content merges back into the pool
5. Creators receive feedback and adapt strategy
6. Model-level metrics are collected
"""

from __future__ import annotations

import random
import statistics
from typing import Any

from mesa import Model
from mesa.datacollection import DataCollector

from config import SimulationConfig
from agents.user_agent import UserAgent
from agents.creator_agent import CreatorAgent
from agents.algorithm_agent import AlgorithmAgent
from model.network_builder import build_social_graph

Content = dict[str, Any]


class SocialMediaModel(Model):
    """
    Agent-based model of algorithmic echo chambers on a social media platform.

    Parameters
    ----------
    config : SimulationConfig
        All tuneable simulation parameters.
    """

    def __init__(self, config: SimulationConfig | None = None) -> None:
        super().__init__()

        self.config = config or SimulationConfig()
        cfg = self.config

        # ── Reproducibility ───────────────────────────────────────────────
        random.seed(cfg.random_seed)

        # ── Social graph ──────────────────────────────────────────────────
        # Map config network_type names → builder's accepted names
        _type_map = {
            "barabasi_albert": "scale_free",
            "scale_free": "scale_free",
            "watts_strogatz": "small_world",
            "small_world": "small_world",
            "erdos_renyi": "random",
            "random": "random",
        }
        net_type = _type_map.get(cfg.network_type, "scale_free")
        self.graph = build_social_graph(
            num_users=cfg.num_users,
            network_type=net_type,
            avg_degree=cfg.avg_degree,
            seed=cfg.random_seed,
        )

        # ── Content state ─────────────────────────────────────────────────
        self.content_pool: list[Content] = []
        self._content_id_counter: int = 0

        # ── Agents ───────────────────────────────────────────────────────
        self.user_agents: list[UserAgent] = []
        self.creator_agents: list[CreatorAgent] = []
        self._create_users()   # registers agents via Mesa 3 self.agents
        self._create_creators()

        # ── Algorithm (system-level, not scheduled) ───────────────────────
        self.algorithm = AlgorithmAgent(
            model=self,
            engagement_weight=cfg.engagement_weight,
            similarity_weight=cfg.similarity_weight,
            diversity_weight=cfg.diversity_weight,
            credibility_weight=cfg.credibility_weight,
            misinformation_penalty=cfg.misinformation_penalty,
            exploration_rate=cfg.exploration_rate,
            diversity_injection_rate=cfg.diversity_injection_rate,
        )

        # ── Metrics store ─────────────────────────────────────────────────
        self.metrics: list[dict[str, float]] = []

        # ── Mesa DataCollector ────────────────────────────────────────────
        self.datacollector = DataCollector(
            model_reporters={
                "mean_belief": lambda m: m._current_metric("mean_belief"),
                "polarization_index": lambda m: m._current_metric("polarization_index"),
                "misinformation_prevalence": lambda m: m._current_metric(
                    "misinformation_prevalence"
                ),
                "average_engagement": lambda m: m._current_metric("average_engagement"),
                "average_exposure_diversity": lambda m: m._current_metric(
                    "average_exposure_diversity"
                ),
            }
        )

    # ──────────────────────────────────────────────────────────────────────
    # Initialisation helpers
    # ──────────────────────────────────────────────────────────────────────

    def _create_users(self) -> None:
        """Instantiate user agents with randomised personality traits."""
        cfg = self.config
        for _ in range(cfg.num_users):
            user = UserAgent(
                model=self,
                belief_score=random.uniform(-1.0, 1.0),
                openness=random.betavariate(2, 2),          # peaks near 0.5
                trust_level=random.uniform(0.3, 0.9),
                susceptibility_to_misinformation=random.betavariate(2, 5),
                activity_level=random.betavariate(2, 3),
                share_probability=random.uniform(0.05, 0.4),
                fact_check_tendency=random.betavariate(2, 5),
            )
            # Mesa 3: agents auto-register in self.agents on __init__
            self.user_agents.append(user)

    def _create_creators(self) -> None:
        """Instantiate creator agents; a fraction are bots."""
        cfg = self.config
        n_bots = max(0, int(cfg.num_creators * cfg.bot_creator_fraction))

        for i in range(cfg.num_creators):
            is_bot = i < n_bots
            creator = CreatorAgent(
                model=self,
                ideology_position=random.uniform(-1.0, 1.0),
                credibility_score=random.uniform(0.2, 0.5) if is_bot else random.uniform(0.4, 1.0),
                engagement_strategy=random.uniform(0.6, 1.0) if is_bot else random.uniform(0.1, 0.7),
                posting_frequency=random.uniform(0.7, 1.0) if is_bot else random.uniform(0.2, 0.8),
                audience_sensitivity=random.uniform(0.1, 0.4),
                extremeness_level=random.uniform(0.5, 1.0) if is_bot else random.uniform(0.0, 0.6),
                is_bot_creator=is_bot,
            )
            # Creators are not Mesa-scheduled directly;
            # they are driven by _generate_content() each step.
            self.creator_agents.append(creator)

    # ──────────────────────────────────────────────────────────────────────
    # Step helpers
    # ──────────────────────────────────────────────────────────────────────

    def _generate_content(self) -> None:
        """
        Ask each creator to generate posts_per_creator items and fill the pool.
        """
        self.content_pool.clear()
        cfg = self.config
        for creator in self.creator_agents:
            for _ in range(cfg.posts_per_creator):
                content = creator.generate_content()
                content["content_id"] = self._next_content_id()
                self.content_pool.append(content)

    def _process_user_feeds(self) -> dict[str, list[float]]:
        """
        Deliver personalised feeds to users, drive consumption and belief updates.

        Returns
        -------
        dict
            Per-step engagement and diversity lists for metric computation.
        """
        cfg = self.config
        reshared: list[Content] = []
        step_engagements: list[float] = []
        step_diversities: list[float] = []
        misinfo_encounters: list[bool] = []

        for user in self.user_agents:
            # Skip inactive users this tick
            if random.random() > user.activity_level:
                continue

            feed = self.algorithm.rank_content_for_user(
                user, self.content_pool, top_k=cfg.feed_size
            )

            if not feed:
                continue

            # Record diversity of this feed
            user.consume_content(feed)
            if user.exposure_diversity_history:
                step_diversities.append(user.exposure_diversity_history[-1])

            engaged_count = 0
            for content in feed:
                decision = user.evaluate_content(content)
                misinfo_encounters.append(bool(content.get("misinformation", False)))

                if decision in ("like", "share"):
                    user.update_belief(content)
                    engaged_count += 1

                if decision == "share":
                    reshared_item = dict(content)
                    reshared_item["reshared_by"] = user.unique_id
                    reshared.append(reshared_item)

            step_engagements.append(engaged_count / len(feed))

        # Merge reshares back into pool for potential downstream use
        self.content_pool.extend(reshared)

        return {
            "engagements": step_engagements,
            "diversities": step_diversities,
            "misinfo": [float(m) for m in misinfo_encounters],
        }

    def _adapt_creators(self, engagements: list[float]) -> None:
        """
        Pass simple engagement feedback back to each creator.
        """
        avg_engagement = statistics.mean(engagements) if engagements else 0.0
        for creator in self.creator_agents:
            feedback = {
                "engagement": avg_engagement,
                "was_extreme": creator.extremeness_level > 0.5,
                "was_sensational": creator.engagement_strategy > 0.5,
                "was_credible": creator.credibility_score > 0.6,
            }
            creator.adapt_strategy(feedback)

    def _collect_metrics(self, step_data: dict[str, list[float]]) -> None:
        """
        Compute and store model-level metrics for the current step.
        """
        beliefs = [u.belief_score for u in self.user_agents]

        mean_belief = statistics.mean(beliefs) if beliefs else 0.0
        polarization_index = statistics.stdev(beliefs) if len(beliefs) > 1 else 0.0

        engagements = step_data.get("engagements", [])
        diversities = step_data.get("diversities", [])
        misinfo = step_data.get("misinfo", [])

        avg_engagement = statistics.mean(engagements) if engagements else 0.0
        avg_diversity = statistics.mean(diversities) if diversities else 0.0
        misinfo_prevalence = statistics.mean(misinfo) if misinfo else 0.0

        tick_metrics = {
            "step": self.steps,
            "mean_belief": mean_belief,
            "polarization_index": polarization_index,
            "misinformation_prevalence": misinfo_prevalence,
            "average_engagement": avg_engagement,
            "average_exposure_diversity": avg_diversity,
        }
        self.metrics.append(tick_metrics)

    def _current_metric(self, key: str) -> float:
        """Return the latest value for *key* from the metrics store."""
        if not self.metrics:
            return 0.0
        return self.metrics[-1].get(key, 0.0)

    def _next_content_id(self) -> int:
        self._content_id_counter += 1
        return self._content_id_counter

    # ──────────────────────────────────────────────────────────────────────
    # Main step
    # ──────────────────────────────────────────────────────────────────────

    def step(self) -> None:
        """
        Advance the simulation by one tick.

        Order of operations:
        1. Creators generate content.
        2. Algorithm delivers personalised feeds; users consume and update.
        3. Creators adapt based on aggregate engagement.
        4. Metrics are collected.
        5. DataCollector records model-level reporters.
        6. Mesa scheduler advances time.
        """
        # 1. Content generation
        self._generate_content()

        # 2. User feed processing (returns raw per-step data)
        step_data = self._process_user_feeds()

        # 3. Creator adaptation
        self._adapt_creators(step_data.get("engagements", []))

        # 4. Metrics
        self._collect_metrics(step_data)

        # 5. DataCollector snapshot
        self.datacollector.collect(self)

        # 6. Activate all user agents in random order
        #    (Mesa 3 automatically increments self.steps after step() returns)
        self.agents.shuffle_do("step")
