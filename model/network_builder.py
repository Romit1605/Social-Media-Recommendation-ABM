"""
Network builder for the Algorithmic Echo Chambers ABM.

Constructs social graphs with realistic connectivity patterns
for simulating information diffusion on social media platforms.
"""

from __future__ import annotations

import networkx as nx


def build_social_graph(
    num_users: int,
    network_type: str = "scale_free",
    avg_degree: int = 6,
    seed: int | None = None,
) -> nx.Graph:
    """
    Build a social graph for the user population.

    Parameters
    ----------
    num_users : int
        Number of user nodes in the network.
    network_type : {"scale_free", "small_world", "random"}
        Topology family:
        - **scale_free** : Barabási–Albert preferential-attachment graph.
          Produces hubs similar to real social networks.
        - **small_world** : Watts–Strogatz small-world graph.
          High clustering with short path lengths.
        - **random** : Erdős–Rényi random graph.
          Uniform connection probability.
    avg_degree : int, default 6
        Target mean degree. Actual mean may differ slightly
        depending on the generator used.
    seed : int or None
        Random seed for reproducibility.

    Returns
    -------
    nx.Graph
        An undirected NetworkX graph with `num_users` nodes.

    Raises
    ------
    ValueError
        If `network_type` is not one of the supported options.
    """
    network_type = network_type.lower().replace("-", "_").replace(" ", "_")

    if network_type == "scale_free":
        # Barabási–Albert: each new node attaches to m existing nodes
        m = max(1, avg_degree // 2)
        G = nx.barabasi_albert_graph(n=num_users, m=m, seed=seed)

    elif network_type == "small_world":
        # Watts–Strogatz: ring lattice rewired with probability p
        k = avg_degree if avg_degree % 2 == 0 else avg_degree + 1
        k = max(2, k)  # must be >= 2
        rewire_prob = 0.1  # typical small-world rewiring
        G = nx.watts_strogatz_graph(n=num_users, k=k, p=rewire_prob, seed=seed)

    elif network_type == "random":
        # Erdős–Rényi: probability p computed to yield avg_degree
        p = avg_degree / (num_users - 1) if num_users > 1 else 0
        G = nx.erdos_renyi_graph(n=num_users, p=p, seed=seed)

    else:
        supported = ("scale_free", "small_world", "random")
        raise ValueError(
            f"Unknown network_type '{network_type}'. Choose from {supported}."
        )

    # ── Ensure no isolated nodes ─────────────────────────────────────────
    _connect_isolates(G, seed=seed)

    return G


def _connect_isolates(G: nx.Graph, seed: int | None = None) -> None:
    """
    Attach any isolated nodes to a random non-isolated neighbour.

    Modifies the graph in place.
    """
    import random

    rng = random.Random(seed)
    isolates = list(nx.isolates(G))

    if not isolates:
        return

    non_isolates = [n for n in G.nodes() if G.degree(n) > 0]

    # Edge case: all nodes isolated (e.g., num_users=1 or p=0)
    if not non_isolates:
        # Chain isolates together
        for i in range(len(isolates) - 1):
            G.add_edge(isolates[i], isolates[i + 1])
        return

    for node in isolates:
        target = rng.choice(non_isolates)
        G.add_edge(node, target)


# ── Quick sanity test ────────────────────────────────────────────────────
if __name__ == "__main__":
    G = build_social_graph(num_users=100, network_type="scale_free", avg_degree=6, seed=42)

    print(f"Number of nodes: {G.number_of_nodes()} - network_builder.py:113")
    print(f"Number of edges: {G.number_of_edges()} - network_builder.py:114")
    print(f"Average degree: {2 * G.number_of_edges() / G.number_of_nodes():.2f} - network_builder.py:115")
