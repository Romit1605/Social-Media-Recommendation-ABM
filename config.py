"""
Configuration for the "Algorithmic Echo Chambers" agent-based model.

Agents:
  - User agents:              consume, engage with, and reshare content
  - Content creator agents:   produce posts (including potential misinformation)
  - Algorithm agent:          recommends content to users via a scored feed

Built with Python Mesa.
"""

from dataclasses import dataclass, field


@dataclass
class SimulationConfig:
    """All tuneable parameters for one simulation run."""

    # ── Population ───────────────────────────────────────────────────────
    num_users: int = 100                # number of user agents
    num_creators: int = 20              # number of content-creator agents

    # ── Network topology ─────────────────────────────────────────────────
    network_type: str = "barabasi_albert"   # "barabasi_albert", "erdos_renyi",
                                            # "watts_strogatz", "complete"
    avg_degree: int = 6                     # mean connections per node

    # ── Simulation ───────────────────────────────────────────────────────
    simulation_steps: int = 200         # total ticks to run
    random_seed: int = 42               # reproducibility seed

    # ── Content generation ───────────────────────────────────────────────
    posts_per_creator: int = 3          # new posts each creator publishes per step

    # ── Recommendation algorithm weights ─────────────────────────────────
    feed_size: int = 10                 # posts shown to each user per step
    engagement_weight: float = 0.4      # weight on predicted engagement score
    similarity_weight: float = 0.3      # weight on belief-similarity to user
    diversity_weight: float = 0.1       # weight on topic diversity in the feed
    credibility_weight: float = 0.2     # weight on source credibility score

    # ── Misinformation & exploration ─────────────────────────────────────
    misinformation_penalty: float = 0.5     # penalty applied to flagged content
    exploration_rate: float = 0.1           # fraction of feed slots filled
                                            # with random / exploratory content

    # ── User behaviour ───────────────────────────────────────────────────
    belief_update_strength: float = 0.05    # how much a single exposure shifts
                                            # a user's belief vector
    reshare_threshold: float = 0.7          # min alignment score for a user
                                            # to reshare a post

    # ── Diversity injection ──────────────────────────────────────────────
    diversity_injection_rate: float = 0.05  # probability of injecting an
                                            # opposing-viewpoint post into a feed

    # ── Creator dynamics ─────────────────────────────────────────────────
    creator_adaptation_rate: float = 0.1    # how quickly creators shift content
                                            # toward higher-engagement topics
    bot_creator_fraction: float = 0.1       # fraction of creators that behave
                                            # as automated / bot accounts


# ── Singleton instance used throughout the project ───────────────────────
CONFIG = SimulationConfig()
