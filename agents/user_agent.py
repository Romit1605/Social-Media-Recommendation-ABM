"""
UserAgent for the Algorithmic Echo Chambers ABM.

Simulates a social-media user who consumes content, updates beliefs,
and decides whether to engage with or share posts.
"""

from __future__ import annotations

import random
from typing import TYPE_CHECKING, Any

from mesa import Agent

if TYPE_CHECKING:
    from model.social_model import EchoChamberModel

# Type alias for content dictionaries
Content = dict[str, Any]


class UserAgent(Agent):
    """
    A user agent that consumes algorithmic feeds and may form echo chambers.

    Attributes
    ----------
    belief_score : float
        Ideological leaning in [-1, 1]. Negative = left, positive = right.
    openness : float
        Willingness to engage with content outside own belief (0–1).
    trust_level : float
        Baseline trust in content sources (0–1).
    susceptibility_to_misinformation : float
        Probability multiplier for believing false content (0–1).
    activity_level : float
        How often the user is active / engages (0–1).
    share_probability : float
        Base probability of sharing liked content (0–1).
    fact_check_tendency : float
        Likelihood of fact-checking before sharing (0–1).
    """

    def __init__(
        self,
        model: "EchoChamberModel",
        belief_score: float = 0.0,
        openness: float = 0.5,
        trust_level: float = 0.5,
        susceptibility_to_misinformation: float = 0.3,
        activity_level: float = 0.5,
        share_probability: float = 0.2,
        fact_check_tendency: float = 0.3,
    ) -> None:
        super().__init__(model)

        # Core personality / disposition
        self.belief_score = self._clamp(belief_score, -1.0, 1.0)
        self.openness = self._clamp(openness, 0.0, 1.0)
        self.trust_level = self._clamp(trust_level, 0.0, 1.0)
        self.susceptibility_to_misinformation = self._clamp(
            susceptibility_to_misinformation, 0.0, 1.0
        )
        self.activity_level = self._clamp(activity_level, 0.0, 1.0)
        self.share_probability = self._clamp(share_probability, 0.0, 1.0)
        self.fact_check_tendency = self._clamp(fact_check_tendency, 0.0, 1.0)

        # Tracking history
        self.seen_content_history: list[Content] = []
        self.engagement_history: list[dict[str, Any]] = []
        self.exposure_diversity_history: list[float] = []

    # ──────────────────────────────────────────────────────────────────────
    # Public methods
    # ──────────────────────────────────────────────────────────────────────

    def consume_content(self, feed_items: list[Content]) -> None:
        """
        Process a feed of content items delivered by the algorithm.

        Records what was seen and computes exposure diversity for this step.
        """
        if not feed_items:
            self.exposure_diversity_history.append(0.0)
            return

        self.seen_content_history.extend(feed_items)

        # Diversity = std-dev of ideology values in this batch (0 if uniform)
        ideologies = [item.get("ideology", 0.0) for item in feed_items]
        diversity = self._std(ideologies) if len(ideologies) > 1 else 0.0
        self.exposure_diversity_history.append(diversity)

    def evaluate_content(self, content: Content) -> str:
        """
        Decide how to react to a piece of content.

        Returns
        -------
        str
            One of "like", "share", or "ignore".
        """
        ideology = content.get("ideology", 0.0)
        sensationalism = content.get("sensationalism", 0.0)
        is_misinfo = content.get("misinformation", False)

        # Alignment: how close is content to user's belief?
        alignment = 1.0 - abs(self.belief_score - ideology) / 2.0  # in [0, 1]

        # Engagement boost from sensationalism (especially for susceptible users)
        sensation_boost = sensationalism * self.susceptibility_to_misinformation

        engage_score = alignment + sensation_boost

        # Threshold varies with activity level
        like_threshold = 0.6 - 0.2 * self.activity_level
        share_threshold = 0.8 - 0.1 * self.activity_level

        if engage_score >= share_threshold and random.random() < self.share_probability:
            # Fact-check gate for misinfo
            if is_misinfo and self.maybe_fact_check(content):
                return "ignore"
            return "share"

        if engage_score >= like_threshold:
            return "like"

        return "ignore"

    def update_belief(self, content: Content) -> None:
        """
        Adjust belief_score after engaging with content.

        - Aligned, credible content reinforces current belief.
        - Diverse, credible content can moderate belief.
        - Misinformation affects highly susceptible users more.
        """
        ideology = content.get("ideology", 0.0)
        credibility = content.get("credibility", 0.5)
        is_misinfo = content.get("misinformation", False)

        # Base shift toward content ideology
        direction = ideology - self.belief_score
        strength = self.model.config.belief_update_strength if hasattr(self.model, "config") else 0.05

        # Credibility dampens or amplifies
        effective_strength = strength * credibility

        # Misinfo amplification for susceptible users
        if is_misinfo:
            effective_strength *= 1.0 + self.susceptibility_to_misinformation

        # Openness allows movement; low openness resists change
        effective_strength *= self.openness

        self.belief_score += direction * effective_strength
        self.belief_score = self._clamp(self.belief_score, -1.0, 1.0)

    def maybe_fact_check(self, content: Content) -> bool:
        """
        Probabilistically fact-check content.

        Returns True if the user catches misinformation (rejects it).
        """
        is_misinfo = content.get("misinformation", False)
        if not is_misinfo:
            return False  # nothing to catch

        # Higher tendency → higher chance of catching misinfo
        return random.random() < self.fact_check_tendency

    def step(self) -> None:
        """
        Called each simulation tick by Mesa scheduler.

        Content consumption is driven externally by the model/algorithm,
        so this is a placeholder for any per-step upkeep.
        """
        pass

    # ──────────────────────────────────────────────────────────────────────
    # Helpers
    # ──────────────────────────────────────────────────────────────────────

    @staticmethod
    def _clamp(value: float, lo: float, hi: float) -> float:
        return max(lo, min(hi, value))

    @staticmethod
    def _std(values: list[float]) -> float:
        """Compute population standard deviation."""
        n = len(values)
        if n == 0:
            return 0.0
        mean = sum(values) / n
        variance = sum((x - mean) ** 2 for x in values) / n
        return variance ** 0.5
