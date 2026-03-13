"""
Experiment runner for the Algorithmic Echo Chambers project.

Runs multiple simulation scenarios, collects model-level metrics, and saves
the combined results to ``data/outputs/experiment_results.csv``.
"""

from __future__ import annotations

import os
import sys
from dataclasses import replace

import pandas as pd

# Ensure the project root is importable when running this file directly.
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from config import SimulationConfig
from model.social_model import SocialMediaModel


OUTPUT_DIR = os.path.join("data", "outputs")
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "experiment_results.csv")


def run_scenario(name: str, config: SimulationConfig) -> pd.DataFrame:
	"""
	Run one scenario configuration and return its per-step metrics.

	Parameters
	----------
	name : str
		Scenario name.
	config : SimulationConfig
		Configuration to run.

	Returns
	-------
	pd.DataFrame
		DataFrame of model metrics with added ``scenario`` and ``run_id``
		columns.
	"""
	model = SocialMediaModel(config)
	for _ in range(config.simulation_steps):
		model.step()

	df = pd.DataFrame(model.metrics)
	df["scenario"] = name
	df["run_id"] = config.random_seed
	return df


def main() -> None:
	"""Run all configured scenarios and save the combined experiment table."""
	os.makedirs(OUTPUT_DIR, exist_ok=True)

	base_config = SimulationConfig()
	seeds = [101, 202, 303]

	scenario_templates: dict[str, SimulationConfig] = {
		"baseline": base_config,
		"high_engagement_optimization": replace(
			base_config,
			engagement_weight=min(1.0, base_config.engagement_weight + 0.25),
			credibility_weight=max(0.0, base_config.credibility_weight - 0.10),
		),
		"strong_personalization_bias": replace(
			base_config,
			similarity_weight=min(1.0, base_config.similarity_weight + 0.25),
			diversity_weight=max(0.0, base_config.diversity_weight - 0.05),
		),
		"diversity_injection_intervention": replace(
			base_config,
			diversity_weight=min(1.0, base_config.diversity_weight + 0.20),
			diversity_injection_rate=min(
				1.0, base_config.diversity_injection_rate + 0.15
			),
		),
	}

	all_results: list[pd.DataFrame] = []
	total_runs = len(scenario_templates) * len(seeds)
	run_counter = 0

	for scenario_name, template_config in scenario_templates.items():
		for repetition, seed in enumerate(seeds, start=1):
			run_counter += 1
			print(
				f"Running scenario '{scenario_name}' "
				f"(repetition {repetition}/3, seed={seed}) "
				f"[{run_counter}/{total_runs}]"
			)

			scenario_config = replace(template_config, random_seed=seed)
			result_df = run_scenario(scenario_name, scenario_config)
			all_results.append(result_df)

	combined_df = pd.concat(all_results, ignore_index=True)
	combined_df.to_csv(OUTPUT_FILE, index=False)

	print(f"\nExperiment results saved to: {OUTPUT_FILE} - run_experiments.py:102")


if __name__ == "__main__":
	main()
