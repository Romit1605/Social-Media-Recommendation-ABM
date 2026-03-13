"""
app.py — Solara interactive dashboard for the Algorithmic Echo Chambers ABM.

Title:
  Algorithmic Echo Chambers: An Agent-Based Simulation of AI Recommendation,
  Misinformation, and Polarization in Social Networks

Run with:
  solara run app.py
"""

from __future__ import annotations

import matplotlib
matplotlib.use("Agg")  # headless backend required for Solara

import matplotlib.pyplot as plt
import matplotlib.colors as mcolors
import networkx as nx
import numpy as np
import solara

from mesa.visualization.solara_viz import SolaraViz
from mesa.visualization.components.matplotlib_components import make_mpl_plot_component
from mesa.visualization.user_param import Slider

from config import SimulationConfig
from model.social_model import SocialMediaModel


# ── AppModel ──────────────────────────────────────────────────────────────
# Thin wrapper so SolaraViz can instantiate the model from individual kwargs.

class AppModel(SocialMediaModel):
    """SocialMediaModel subclass with flat kwargs for SolaraViz compatibility."""

    def __init__(
        self,
        num_users: int = 100,
        num_creators: int = 20,
        engagement_weight: float = 0.4,
        similarity_weight: float = 0.3,
        diversity_weight: float = 0.1,
        credibility_weight: float = 0.2,
        misinformation_penalty: float = 0.5,
        diversity_injection_rate: float = 0.05,
        simulation_steps: int = 200,
    ) -> None:
        config = SimulationConfig(
            num_users=num_users,
            num_creators=num_creators,
            engagement_weight=engagement_weight,
            similarity_weight=similarity_weight,
            diversity_weight=diversity_weight,
            credibility_weight=credibility_weight,
            misinformation_penalty=misinformation_penalty,
            diversity_injection_rate=diversity_injection_rate,
            simulation_steps=simulation_steps,
        )
        super().__init__(config)
        # Pre-compute layout so the network plot is consistent across steps
        self._graph_layout: dict = nx.spring_layout(self.graph, seed=42, k=0.8)


# ── Model parameters (sidebar sliders) ───────────────────────────────────

model_params = {
    "num_users": Slider("Number of Users", value=100, min=20, max=300, step=10),
    "num_creators": Slider("Number of Creators", value=20, min=2, max=50, step=1),
    "engagement_weight": Slider("Engagement Weight", value=0.4, min=0.0, max=1.0, step=0.05, dtype=float),
    "similarity_weight": Slider("Similarity Weight", value=0.3, min=0.0, max=1.0, step=0.05, dtype=float),
    "diversity_weight": Slider("Diversity Weight", value=0.1, min=0.0, max=1.0, step=0.05, dtype=float),
    "credibility_weight": Slider("Credibility Weight", value=0.2, min=0.0, max=1.0, step=0.05, dtype=float),
    "misinformation_penalty": Slider("Misinformation Penalty", value=0.5, min=0.0, max=1.0, step=0.05, dtype=float),
    "diversity_injection_rate": Slider("Diversity Injection Rate", value=0.05, min=0.0, max=0.5, step=0.01, dtype=float),
    "simulation_steps": Slider("Max Steps", value=200, min=10, max=500, step=10),
}


# ── Network visualization component ──────────────────────────────────────

def _make_network_figure(model: AppModel) -> plt.Figure:
    """Build a matplotlib Figure of the user network coloured by belief."""
    G = model.graph
    layout = getattr(model, "_graph_layout", None) or nx.spring_layout(G, seed=42)

    belief_map = {u.unique_id: u.belief_score for u in model.user_agents}

    # Map belief [-1, 1] → colour: blue (left) / gray (neutral) / red (right)
    node_colors = []
    for node in G.nodes():
        b = belief_map.get(node, 0.0)
        if b < -0.1:
            intensity = 0.35 + abs(b) * 0.65
            node_colors.append((0.1, 0.2, min(1.0, intensity)))
        elif b > 0.1:
            intensity = 0.35 + b * 0.65
            node_colors.append((min(1.0, intensity), 0.1, 0.1))
        else:
            node_colors.append((0.65, 0.65, 0.65))

    fig, ax = plt.subplots(figsize=(5.5, 4.5))
    nx.draw_networkx(
        G,
        pos=layout,
        ax=ax,
        node_color=node_colors,
        node_size=max(10, 600 // max(len(G.nodes()), 1)),
        with_labels=False,
        edge_color="#d0d0d0",
        width=0.3,
        alpha=0.88,
    )
    ax.set_title(
        f"User Network — Step {model.steps}\n"
        "Blue = Left-leaning  |  Gray = Neutral  |  Red = Right-leaning",
        fontsize=9,
    )
    ax.axis("off")
    fig.tight_layout()
    return fig


def _network_component(model: AppModel) -> solara.component:
    """Solara component factory for the user network plot."""

    @solara.component
    def NetworkGraph(model: AppModel):
        fig = _make_network_figure(model)
        solara.FigureMatplotlib(fig)
        plt.close(fig)

    return NetworkGraph(model)


# ── Metrics plot components ───────────────────────────────────────────────
# Keys must exactly match the DataCollector reporter names in SocialMediaModel.

MeanBeliefPlot = make_mpl_plot_component("mean_belief")
PolarizationPlot = make_mpl_plot_component("polarization_index")
MisinfoPlot = make_mpl_plot_component("misinformation_prevalence")
EngagementPlot = make_mpl_plot_component("average_engagement")
DiversityPlot = make_mpl_plot_component("average_exposure_diversity")


# ── SolaraViz page ────────────────────────────────────────────────────────

model = AppModel()

page = SolaraViz(
    model,
    name="Algorithmic Echo Chambers",
    components=[
        (_network_component, 0),
        MeanBeliefPlot,
        PolarizationPlot,
        MisinfoPlot,
        EngagementPlot,
        DiversityPlot,
    ],
    model_params=model_params,
    play_interval=150,
)
