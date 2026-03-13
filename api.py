"""
FastAPI backend for the Algorithmic Echo Chambers ABM.

Run with:
    uvicorn api:app --reload
"""

from __future__ import annotations

from dataclasses import asdict
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from config import SimulationConfig
from model.social_model import SocialMediaModel


# ── App setup ─────────────────────────────────────────────────────────────

app = FastAPI(
    title="Algorithmic Echo Chambers API",
    description=(
        "API for the Agent-Based Simulation of AI Recommendation, "
        "Misinformation, and Polarization in Social Networks"
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Global model state ───────────────────────────────────────────────────

_model: SocialMediaModel | None = None
_last_config: SimulationConfig = SimulationConfig()


# ── Request / response schemas ────────────────────────────────────────────

class InitRequest(BaseModel):
    """Parameters accepted by POST /init (all optional, defaults from config)."""
    num_users: int = 100
    num_creators: int = 20
    network_type: str = "barabasi_albert"
    avg_degree: int = 6
    simulation_steps: int = 200
    random_seed: int = 42
    posts_per_creator: int = 3
    feed_size: int = 10
    engagement_weight: float = 0.4
    similarity_weight: float = 0.3
    diversity_weight: float = 0.1
    credibility_weight: float = 0.2
    misinformation_penalty: float = 0.5
    exploration_rate: float = 0.1
    belief_update_strength: float = 0.05
    reshare_threshold: float = 0.7
    diversity_injection_rate: float = 0.05
    creator_adaptation_rate: float = 0.1
    bot_creator_fraction: float = 0.1


class RunRequest(BaseModel):
    """Body for POST /run."""
    steps: int = Field(default=1, ge=1, le=5000)


# ── Helpers ───────────────────────────────────────────────────────────────

def _serialize_agents(model: SocialMediaModel) -> list[dict[str, Any]]:
    """Return a frontend-friendly list of agent node data."""
    nodes: list[dict[str, Any]] = []
    for user in model.user_agents:
        nodes.append({
            "id": user.unique_id,
            "belief_score": round(user.belief_score, 4),
            "openness": round(user.openness, 4),
            "susceptibility_to_misinformation": round(
                user.susceptibility_to_misinformation, 4
            ),
            "type": "user",
        })
    for creator in model.creator_agents:
        nodes.append({
            "id": creator.unique_id,
            "ideology_position": round(creator.ideology_position, 4),
            "credibility_score": round(creator.credibility_score, 4),
            "is_bot_creator": creator.is_bot_creator,
            "type": "creator",
        })
    return nodes


def _serialize_links(model: SocialMediaModel) -> list[dict[str, int]]:
    """Return graph edges as [{source: id, target: id}, ...] matching node IDs."""
    # Graph nodes 0..num_users-1 map directly to user_agents[i].unique_id
    id_map = {i: agent.unique_id for i, agent in enumerate(model.user_agents)}
    return [
        {"source": id_map[u], "target": id_map[v]}
        for u, v in model.graph.edges()
        if u in id_map and v in id_map
    ]


def _latest_metrics(model: SocialMediaModel) -> dict[str, Any]:
    """Return the most recent metrics dict, or empty defaults."""
    if model.metrics:
        return model.metrics[-1]
    return {
        "step": 0,
        "mean_belief": 0.0,
        "polarization_index": 0.0,
        "misinformation_prevalence": 0.0,
        "average_engagement": 0.0,
        "average_exposure_diversity": 0.0,
    }


def _require_model() -> SocialMediaModel:
    """Return the global model or raise 400."""
    if _model is None:
        raise HTTPException(
            status_code=400,
            detail="Model not initialised. Call POST /init first.",
        )
    return _model


# ── Endpoints ─────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/init")
def init_model(req: InitRequest):
    """Initialise (or re-initialise) the simulation model."""
    global _model, _last_config

    _last_config = SimulationConfig(**req.model_dump())
    _model = SocialMediaModel(_last_config)

    return {
        "message": "Model initialised",
        "config": asdict(_last_config),
        "num_user_agents": len(_model.user_agents),
        "num_creator_agents": len(_model.creator_agents),
        "graph_nodes": _model.graph.number_of_nodes(),
        "graph_edges": _model.graph.number_of_edges(),
    }


@app.post("/step")
def step_model():
    """Advance the model by one step."""
    model = _require_model()
    model.step()

    return {
        "step": model.steps,
        "metrics": _latest_metrics(model),
        "nodes": _serialize_agents(model),
        "links": _serialize_links(model),
    }


@app.post("/run")
def run_model(req: RunRequest):
    """Advance the model by *req.steps* steps."""
    model = _require_model()
    for _ in range(req.steps):
        model.step()

    return {
        "step": model.steps,
        "metrics": _latest_metrics(model),
        "nodes": _serialize_agents(model),
        "links": _serialize_links(model),
    }


@app.post("/reset")
def reset_model():
    """Reset the model using the last configuration."""
    global _model

    _model = SocialMediaModel(_last_config)

    return {
        "message": "Model reset",
        "config": asdict(_last_config),
    }


@app.get("/state")
def get_state():
    """Return full current state of the model."""
    model = _require_model()

    return {
        "step": model.steps,
        "metrics": _latest_metrics(model),
        "nodes": _serialize_agents(model),
        "links": _serialize_links(model),
        "config": asdict(model.config),
    }
