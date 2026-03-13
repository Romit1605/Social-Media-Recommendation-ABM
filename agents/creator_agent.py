"""
CreatorAgent for the Algorithmic Echo Chambers ABM.

Simulates a content creator who produces posts with varying ideology,
credibility, and sensationalism, potentially adapting strategy based
on audience feedback.
"""

from __future__ import annotations

import random
from typing import TYPE_CHECKING, Any

from mesa import Agent

if TYPE_CHECKING:
    from model.social_model import EchoChamberModel

# Type alias for content dictionaries
Content = dict[str, Any]


class CreatorAgent(Agent):
    """
    A content-creator agent that publishes posts to the simulated platform.

    Attributes
    ----------
    ideology_position : float
        Core ideological leaning in [-1, 1].
    credibility_score : float
        Baseline trustworthiness of the creator (0–1).
    engagement_strategy : float
        Tendency to optimise for engagement over accuracy (0–1).
    posting_frequency : float
        Probability of posting each step (0–1).
    audience_sensitivity : float
        How strongly the creator adapts to feedback (0–1).
    extremeness_level : float
        How extreme / polarised the content tends to be (0–1).
    is_bot_creator : bool
        Whether this creator is an automated / bot account.
    """

    _content_counter: int = 0  # class-level counter for unique content IDs

    def __init__(
        self,
        model: "EchoChamberModel",
        ideology_position: float = 0.0,
        credibility_score: float = 0.7,
        engagement_strategy: float = 0.3,
        posting_frequency: float = 0.5,
        audience_sensitivity: float = 0.2,
        extremeness_level: float = 0.2,
        is_bot_creator: bool = False,
    ) -> None:
        super().__init__(model)

        self.ideology_position = self._clamp(ideology_position, -1.0, 1.0)
        self.credibility_score = self._clamp(credibility_score, 0.0, 1.0)
        self.engagement_strategy = self._clamp(engagement_strategy, 0.0, 1.0)
        self.posting_frequency = self._clamp(posting_frequency, 0.0, 1.0)
        self.audience_sensitivity = self._clamp(audience_sensitivity, 0.0, 1.0)
        self.extremeness_level = self._clamp(extremeness_level, 0.0, 1.0)
        self.is_bot_creator = is_bot_creator

        # Track performance of recent content
        self.recent_feedback: list[dict[str, Any]] = []

    # ──────────────────────────────────────────────────────────────────────
    # Content generation
    # ──────────────────────────────────────────────────────────────────────

    def generate_content(self) -> Content:
        """
        Produce a single content item.

        Returns
        -------
        Content
            A dictionary representing one post with metadata.
        """
        CreatorAgent._content_counter += 1

        # Ideology: centred on creator position with noise scaled by extremeness
        noise = random.gauss(0, 0.1 * (1 - self.extremeness_level))
        ideology = self._clamp(self.ideology_position + noise, -1.0, 1.0)

        # Push toward poles if extreme
        if self.extremeness_level > 0.5:
            ideology = self._clamp(
                ideology + 0.2 * (1 if ideology >= 0 else -1) * self.extremeness_level,
                -1.0,
                1.0,
            )

        credibility = self._compute_content_credibility()
        misinformation = random.random() < self.compute_misinformation_probability()
        sensationalism = self.compute_sensationalism()
        engagement_potential = self._compute_engagement_potential(
            sensationalism, misinformation
        )

        timestamp = self.model.schedule.time if hasattr(self.model, "schedule") else 0

        return {
            "content_id": CreatorAgent._content_counter,
            "creator_id": self.unique_id,
            "ideology": ideology,
            "credibility": credibility,
            "misinformation": misinformation,
            "sensationalism": sensationalism,
            "engagement_potential": engagement_potential,
            "timestamp": timestamp,
        }

    def compute_misinformation_probability(self) -> float:
        """
        Return the probability that a piece of content is misinformation.

        Bots and low-credibility creators have higher probabilities.
        """
        base = 0.05
        credibility_factor = (1 - self.credibility_score) * 0.3
        bot_factor = 0.25 if self.is_bot_creator else 0.0
        extreme_factor = self.extremeness_level * 0.15

        prob = base + credibility_factor + bot_factor + extreme_factor
        return self._clamp(prob, 0.0, 1.0)

    def compute_sensationalism(self) -> float:
        """
        Compute the sensationalism level for a new content item.

        Stronger engagement strategy and extremeness yield higher values.
        """
        base = 0.1
        strategy_boost = self.engagement_strategy * 0.4
        extreme_boost = self.extremeness_level * 0.3
        bot_boost = 0.15 if self.is_bot_creator else 0.0

        level = base + strategy_boost + extreme_boost + bot_boost
        # Add small random jitter
        level += random.uniform(-0.05, 0.05)
        return self._clamp(level, 0.0, 1.0)

    # ──────────────────────────────────────────────────────────────────────
    # Adaptation
    # ──────────────────────────────────────────────────────────────────────

    def adapt_strategy(self, feedback: dict[str, Any]) -> None:
        """
        Adjust creator behaviour based on engagement feedback.

        Parameters
        ----------
        feedback : dict
            Should contain at least:
            - "engagement" : float (e.g., likes + shares)
            - "was_extreme" : bool
            - "was_sensational" : bool
            - "was_credible" : bool
        """
        self.recent_feedback.append(feedback)
        # Keep last N items
        if len(self.recent_feedback) > 20:
            self.recent_feedback.pop(0)

        engagement = feedback.get("engagement", 0.0)
        was_extreme = feedback.get("was_extreme", False)
        was_sensational = feedback.get("was_sensational", False)
        was_credible = feedback.get("was_credible", True)

        adapt_rate = self.audience_sensitivity * 0.05

        # Reward extreme/sensational if it drove engagement
        if engagement > 0.5:
            if was_extreme or was_sensational:
                self.extremeness_level = self._clamp(
                    self.extremeness_level + adapt_rate, 0.0, 1.0
                )
                self.engagement_strategy = self._clamp(
                    self.engagement_strategy + adapt_rate, 0.0, 1.0
                )
            if was_credible:
                # Reinforce credibility focus
                self.credibility_score = self._clamp(
                    self.credibility_score + adapt_rate * 0.5, 0.0, 1.0
                )
        else:
            # Low engagement → try moderating
            if was_extreme:
                self.extremeness_level = self._clamp(
                    self.extremeness_level - adapt_rate, 0.0, 1.0
                )

    # ──────────────────────────────────────────────────────────────────────
    # Scheduler hook
    # ──────────────────────────────────────────────────────────────────────

    def step(self) -> None:
        """
        Called each simulation tick.

        The creator may post content based on posting_frequency.
        Content is added to the model's content pool if available.
        """
        if random.random() < self.posting_frequency:
            content = self.generate_content()
            # Publish to model's content pool (if the model exposes one)
            if hasattr(self.model, "content_pool"):
                self.model.content_pool.append(content)

    # ──────────────────────────────────────────────────────────────────────
    # Helpers
    # ──────────────────────────────────────────────────────────────────────

    def _compute_content_credibility(self) -> float:
        """Derive content credibility from creator credibility with jitter."""
        jitter = random.uniform(-0.1, 0.1)
        return self._clamp(self.credibility_score + jitter, 0.0, 1.0)

    def _compute_engagement_potential(
        self, sensationalism: float, misinformation: bool
    ) -> float:
        """
        Estimate how engaging the content might be.

        Sensationalism boosts engagement; misinformation can too (unfortunately).
        """
        base = 0.3
        sens_boost = sensationalism * 0.4
        misinfo_boost = 0.15 if misinformation else 0.0
        return self._clamp(base + sens_boost + misinfo_boost, 0.0, 1.0)

    @staticmethod
    def _clamp(value: float, lo: float, hi: float) -> float:
        return max(lo, min(hi, value))
