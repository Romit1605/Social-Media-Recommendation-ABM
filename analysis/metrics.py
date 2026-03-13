"""
Metrics module for the Algorithmic Echo Chambers ABM.

Provides functions to compute population-level statistics from user agents,
content pools, and the social graph.
"""

from __future__ import annotations

from typing import Any

import networkx as nx
import numpy as np

Content = dict[str, Any]


# ── Belief & polarisation ────────────────────────────────────────────────

def compute_mean_belief(users: list) -> float:
    """
    Average belief score across all users.

    Parameters
    ----------
    users : list[UserAgent]

    Returns
    -------
    float
        Mean of ``belief_score`` in [-1, 1], or 0.0 if *users* is empty.
    """
    if not users:
        return 0.0
    beliefs = np.array([u.belief_score for u in users])
    return float(np.mean(beliefs))


def compute_polarization_index(users: list) -> float:
    """
    Standard deviation of belief scores — a simple polarisation proxy.

    A value near 0 means consensus; near 1 means a bimodal split.

    Parameters
    ----------
    users : list[UserAgent]

    Returns
    -------
    float
        Population std-dev of ``belief_score``, or 0.0 if fewer than 2 users.
    """
    if len(users) < 2:
        return 0.0
    beliefs = np.array([u.belief_score for u in users])
    return float(np.std(beliefs))


# ── Misinformation ───────────────────────────────────────────────────────

def compute_misinformation_prevalence(content_pool: list[Content]) -> float:
    """
    Fraction of content items flagged as misinformation.

    Parameters
    ----------
    content_pool : list[Content]

    Returns
    -------
    float
        Value in [0, 1], or 0.0 if the pool is empty.
    """
    if not content_pool:
        return 0.0
    flags = np.array([bool(c.get("misinformation", False)) for c in content_pool])
    return float(np.mean(flags))


# ── Engagement ───────────────────────────────────────────────────────────

def compute_average_engagement(users: list) -> float:
    """
    Mean engagement rate across users, derived from their engagement histories.

    Each entry in ``engagement_history`` is expected to be a dict containing
    at least an ``"engagement_rate"`` key (float in [0, 1]).  If a user has
    no history, they contribute 0.

    Parameters
    ----------
    users : list[UserAgent]

    Returns
    -------
    float
        Average engagement rate, or 0.0 if no data.
    """
    if not users:
        return 0.0

    rates: list[float] = []
    for user in users:
        history = getattr(user, "engagement_history", [])
        if history:
            # Support both dict entries and plain float entries
            last = history[-1]
            rate = last.get("engagement_rate", 0.0) if isinstance(last, dict) else float(last)
            rates.append(rate)
        else:
            rates.append(0.0)

    return float(np.mean(rates))


# ── Exposure diversity ───────────────────────────────────────────────────

def compute_average_exposure_diversity(users: list) -> float:
    """
    Mean of the most recent exposure-diversity score across users.

    ``exposure_diversity_history`` stores one float per step (ideological
    std-dev of the feed delivered to that user).

    Parameters
    ----------
    users : list[UserAgent]

    Returns
    -------
    float
        Average diversity, or 0.0 if no data.
    """
    if not users:
        return 0.0

    divs: list[float] = []
    for user in users:
        history = getattr(user, "exposure_diversity_history", [])
        divs.append(history[-1] if history else 0.0)

    return float(np.mean(divs))


# ── Echo-chamber index ───────────────────────────────────────────────────

def compute_echo_chamber_index(users: list, graph: nx.Graph) -> float:
    """
    Measure ideological clustering in the social network.

    For every edge (i, j) in *graph*, compute the belief similarity
    ``1 - |belief_i - belief_j| / 2``.  The echo-chamber index is the
    mean similarity across all edges.

    A value close to 1 means connected users almost always share the
    same ideology — a strong echo chamber.  A value near 0.5 indicates
    random mixing.

    Parameters
    ----------
    users : list[UserAgent]
        Must be indexed / retrievable by ``unique_id``.
    graph : nx.Graph
        Social graph whose node IDs map to user ``unique_id`` values.

    Returns
    -------
    float
        Echo-chamber index in [0, 1], or 0.0 if the graph has no edges.
    """
    if graph.number_of_edges() == 0:
        return 0.0

    # Build a fast lookup: unique_id → belief_score
    belief_map: dict[int, float] = {u.unique_id: u.belief_score for u in users}

    similarities: list[float] = []
    for u, v in graph.edges():
        b_u = belief_map.get(u)
        b_v = belief_map.get(v)
        if b_u is not None and b_v is not None:
            similarities.append(1.0 - abs(b_u - b_v) / 2.0)

    return float(np.mean(similarities)) if similarities else 0.0
