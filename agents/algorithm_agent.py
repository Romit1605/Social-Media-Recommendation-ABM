"""
AlgorithmAgent for the Algorithmic Echo Chambers ABM.

A system-level recommendation component that scores, ranks, and curates
content feeds for each user.  Not a Mesa agent — it has no ``step()`` in
the scheduler — but is called by the model each tick.
"""

from __future__ import annotations

import random
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from agents.user_agent import UserAgent
    from model.social_model import EchoChamberModel

Content = dict[str, Any]


class AlgorithmAgent:
    """
    Platform recommendation algorithm.

    Attributes
    ----------
    model : EchoChamberModel
        Reference to the parent model.
    engagement_weight : float
        Weight given to predicted engagement in the ranking score.
    similarity_weight : float
        Weight for ideological similarity between user and content.
    diversity_weight : float
        Weight for cross-cutting / diverse content.
    credibility_weight : float
        Weight for content credibility.
    misinformation_penalty : float
        Penalty subtracted when content is flagged as misinformation.
    exploration_rate : float
        Fraction of feed slots filled with random content for exploration.
    diversity_injection_rate : float
        Probability of injecting an opposing-viewpoint credible item.
    """

    def __init__(
        self,
        model: "EchoChamberModel",
        engagement_weight: float = 0.4,
        similarity_weight: float = 0.3,
        diversity_weight: float = 0.1,
        credibility_weight: float = 0.2,
        misinformation_penalty: float = 0.5,
        exploration_rate: float = 0.1,
        diversity_injection_rate: float = 0.05,
    ) -> None:
        self.model = model
        self.engagement_weight = engagement_weight
        self.similarity_weight = similarity_weight
        self.diversity_weight = diversity_weight
        self.credibility_weight = credibility_weight
        self.misinformation_penalty = misinformation_penalty
        self.exploration_rate = exploration_rate
        self.diversity_injection_rate = diversity_injection_rate

    # ──────────────────────────────────────────────────────────────────────
    # Scoring components
    # ──────────────────────────────────────────────────────────────────────

    @staticmethod
    def ideological_similarity(user_belief: float, content_ideology: float) -> float:
        """
        Compute ideological similarity between a user and a content item.

        Parameters
        ----------
        user_belief : float
            User's belief score in [-1, 1].
        content_ideology : float
            Content ideology in [-1, 1].

        Returns
        -------
        float
            Similarity score in [0, 1].  1 = perfectly aligned.
        """
        distance = abs(user_belief - content_ideology)  # max 2
        return 1.0 - distance / 2.0

    @staticmethod
    def diversity_bonus(
        user_belief: float,
        content_ideology: float,
        content_credibility: float,
    ) -> float:
        """
        Reward content that is ideologically distant **and** credible.

        Cross-cutting but low-credibility content gets a lower bonus so
        the algorithm does not accidentally promote misinformation in the
        name of diversity.

        Parameters
        ----------
        user_belief : float
        content_ideology : float
        content_credibility : float

        Returns
        -------
        float
            Bonus in [0, 1].
        """
        distance = abs(user_belief - content_ideology) / 2.0  # [0, 1]
        return distance * content_credibility  # both in [0,1] → product in [0,1]

    def predict_engagement(self, user: "UserAgent", content: Content) -> float:
        """
        Estimate how likely *user* is to engage with *content*.

        Engagement is higher when:
        - Content aligns with user beliefs
        - Content is sensational and user is susceptible
        - Content has high base engagement potential

        Returns
        -------
        float
            Predicted engagement in [0, 1].
        """
        ideology = content.get("ideology", 0.0)
        sensationalism = content.get("sensationalism", 0.0)
        engagement_potential = content.get("engagement_potential", 0.5)

        alignment = self.ideological_similarity(user.belief_score, ideology)

        # Susceptible users are drawn to sensational content
        susceptibility_boost = sensationalism * user.susceptibility_to_misinformation

        raw = (
            0.4 * alignment
            + 0.3 * engagement_potential
            + 0.3 * susceptibility_boost
        )
        return max(0.0, min(1.0, raw))

    def score_content(self, user: "UserAgent", content: Content) -> float:
        """
        Compute the composite ranking score for one content item.

        Score = engagement_weight * predicted_engagement
              + similarity_weight * ideological_similarity
              + diversity_weight  * diversity_bonus
              + credibility_weight * credibility
              - misinformation_penalty * misinformation_flag

        Returns
        -------
        float
            Ranking score (higher = shown first).
        """
        ideology = content.get("ideology", 0.0)
        credibility = content.get("credibility", 0.5)
        is_misinfo = content.get("misinformation", False)

        engagement = self.predict_engagement(user, content)
        similarity = self.ideological_similarity(user.belief_score, ideology)
        diversity = self.diversity_bonus(user.belief_score, ideology, credibility)

        score = (
            self.engagement_weight * engagement
            + self.similarity_weight * similarity
            + self.diversity_weight * diversity
            + self.credibility_weight * credibility
            - self.misinformation_penalty * float(is_misinfo)
        )
        return score

    # ──────────────────────────────────────────────────────────────────────
    # Feed construction
    # ──────────────────────────────────────────────────────────────────────

    def rank_content_for_user(
        self,
        user: "UserAgent",
        content_pool: list[Content],
        top_k: int = 10,
    ) -> list[Content]:
        """
        Build a personalised feed for *user*.

        Steps:
        1. Score every item in the pool.
        2. Reserve slots for exploration (random items).
        3. Optionally inject diverse credible content.
        4. Return the top-k items.

        Parameters
        ----------
        user : UserAgent
        content_pool : list[Content]
            All available content this tick.
        top_k : int
            Number of items to return.

        Returns
        -------
        list[Content]
            Ranked feed of length ≤ top_k.
        """
        if not content_pool:
            return []

        # ── Score & sort ──────────────────────────────────────────────
        scored = [
            (self.score_content(user, c), c)
            for c in content_pool
        ]
        scored.sort(key=lambda pair: pair[0], reverse=True)
        ranked = [c for _, c in scored]

        # ── Exploration slots ─────────────────────────────────────────
        n_explore = max(1, int(top_k * self.exploration_rate))
        n_ranked = top_k - n_explore

        feed: list[Content] = ranked[:n_ranked]

        # Fill exploration slots with random items not already in the feed
        remaining = [c for c in content_pool if c not in feed]
        if remaining:
            explore_items = random.sample(remaining, min(n_explore, len(remaining)))
            feed.extend(explore_items)

        # ── Diversity injection ───────────────────────────────────────
        if random.random() < self.diversity_injection_rate:
            n_inject = max(1, int(top_k * self.diversity_injection_rate))
            diverse_items = self.inject_diverse_content(user, content_pool, count=n_inject)
            if diverse_items:
                # Replace lowest-scored tail items with diverse ones
                feed = feed[: top_k - len(diverse_items)] + diverse_items

        return feed[:top_k]

    def inject_diverse_content(
        self,
        user: "UserAgent",
        content_pool: list[Content],
        count: int = 1,
    ) -> list[Content]:
        """
        Select credible content with an opposing viewpoint.

        Parameters
        ----------
        user : UserAgent
        content_pool : list[Content]
        count : int
            Number of diverse items to return.

        Returns
        -------
        list[Content]
            Up to *count* credible cross-cutting items.
        """
        credibility_threshold = 0.5
        candidates = [
            c
            for c in content_pool
            if c.get("credibility", 0.0) >= credibility_threshold
            and self._is_cross_cutting(user.belief_score, c.get("ideology", 0.0))
        ]

        if not candidates:
            return []

        return random.sample(candidates, min(count, len(candidates)))

    # ──────────────────────────────────────────────────────────────────────
    # Helpers
    # ──────────────────────────────────────────────────────────────────────

    @staticmethod
    def _is_cross_cutting(user_belief: float, content_ideology: float) -> bool:
        """Return True if content is on the 'other side' of the user's belief."""
        if abs(user_belief) < 0.1:
            # Near-centrist users: anything beyond ±0.3 counts as cross-cutting
            return abs(content_ideology) > 0.3
        # For polarised users: opposite sign counts
        return (user_belief * content_ideology) < 0
