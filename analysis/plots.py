"""
Plotting utilities for the Algorithmic Echo Chambers project.

Supports both:
- single-run plots from ``data/outputs/simulation_metrics.csv``
- scenario comparison plots from ``data/outputs/experiment_results.csv``
"""

from __future__ import annotations

import os

import matplotlib.pyplot as plt
import pandas as pd


SIMULATION_FILE = os.path.join("data", "outputs", "simulation_metrics.csv")
EXPERIMENT_FILE = os.path.join("data", "outputs", "experiment_results.csv")
PLOTS_DIR = os.path.join("data", "outputs", "plots")

METRIC_COLUMNS = [
	"step",
	"mean_belief",
	"polarization_index",
	"misinformation_prevalence",
	"average_engagement",
	"average_exposure_diversity",
]


def _validate_columns(df: pd.DataFrame, required_columns: list[str], label: str) -> bool:
	"""Return True when a DataFrame contains all required columns."""
	missing_columns = [col for col in required_columns if col not in df.columns]
	if missing_columns:
		print(f"{label} is missing required columns: - plots.py:35")
		for column in missing_columns:
			print(f"{column} - plots.py:37")
		return False
	return True


def plot_metric(
	df: pd.DataFrame,
	column: str,
	title: str,
	ylabel: str,
	output_filename: str,
) -> None:
	"""Create and save a single-run line plot for one metric column."""
	plt.figure(figsize=(8, 5))
	plt.plot(df["step"], df[column], linewidth=2)
	plt.title(title)
	plt.xlabel("Step")
	plt.ylabel(ylabel)
	plt.grid(True, linestyle="--", alpha=0.6)
	plt.tight_layout()
	plt.savefig(os.path.join(PLOTS_DIR, output_filename), dpi=300)
	plt.close()


def plot_scenario_comparison(
	df: pd.DataFrame,
	column: str,
	title: str,
	ylabel: str,
	output_filename: str,
) -> None:
	"""Create and save a scenario-comparison line plot averaged by step."""
	grouped = (
		df.groupby(["scenario", "step"], as_index=False)[column]
		.mean()
		.sort_values(["scenario", "step"])
	)

	plt.figure(figsize=(9, 5.5))
	for scenario, scenario_df in grouped.groupby("scenario"):
		plt.plot(
			scenario_df["step"],
			scenario_df[column],
			linewidth=2,
			label=scenario,
		)

	plt.title(title)
	plt.xlabel("Step")
	plt.ylabel(ylabel)
	plt.legend(title="Scenario")
	plt.grid(True, linestyle="--", alpha=0.6)
	plt.tight_layout()
	plt.savefig(os.path.join(PLOTS_DIR, output_filename), dpi=300)
	plt.close()


def generate_single_run_plots() -> None:
	"""Generate standard plots from the single simulation metrics file."""
	if not os.path.exists(SIMULATION_FILE):
		print(f"Singlerun metrics file not found: {SIMULATION_FILE} - plots.py:97")
		return

	df = pd.read_csv(SIMULATION_FILE)
	if df.empty:
		print(f"Singlerun metrics file is empty: {SIMULATION_FILE} - plots.py:102")
		return

	if not _validate_columns(df, METRIC_COLUMNS, "Single-run metrics file"):
		return

	plot_metric(
		df,
		column="mean_belief",
		title="Mean Belief Over Time",
		ylabel="Mean Belief",
		output_filename="mean_belief.png",
	)
	plot_metric(
		df,
		column="polarization_index",
		title="Polarization Index Over Time",
		ylabel="Polarization Index",
		output_filename="polarization_index.png",
	)
	plot_metric(
		df,
		column="misinformation_prevalence",
		title="Misinformation Prevalence Over Time",
		ylabel="Misinformation Prevalence",
		output_filename="misinformation_prevalence.png",
	)
	plot_metric(
		df,
		column="average_engagement",
		title="Average Engagement Over Time",
		ylabel="Average Engagement",
		output_filename="average_engagement.png",
	)
	plot_metric(
		df,
		column="average_exposure_diversity",
		title="Average Exposure Diversity Over Time",
		ylabel="Average Exposure Diversity",
		output_filename="average_exposure_diversity.png",
	)

	print(f"Singlerun plots saved to: {PLOTS_DIR} - plots.py:144")


def generate_experiment_plots() -> None:
	"""Generate scenario comparison plots from experiment results."""
	if not os.path.exists(EXPERIMENT_FILE):
		print(f"Experiment results file not found: {EXPERIMENT_FILE} - plots.py:150")
		return

	df = pd.read_csv(EXPERIMENT_FILE)
	if df.empty:
		print(f"Experiment results file is empty: {EXPERIMENT_FILE} - plots.py:155")
		return

	required_columns = METRIC_COLUMNS + ["scenario"]
	if not _validate_columns(df, required_columns, "Experiment results file"):
		return

	plot_scenario_comparison(
		df,
		column="polarization_index",
		title="Polarization Index Over Time by Scenario",
		ylabel="Polarization Index",
		output_filename="scenario_polarization.png",
	)
	plot_scenario_comparison(
		df,
		column="misinformation_prevalence",
		title="Misinformation Prevalence Over Time by Scenario",
		ylabel="Misinformation Prevalence",
		output_filename="scenario_misinformation.png",
	)
	plot_scenario_comparison(
		df,
		column="average_engagement",
		title="Average Engagement Over Time by Scenario",
		ylabel="Average Engagement",
		output_filename="scenario_engagement.png",
	)
	plot_scenario_comparison(
		df,
		column="average_exposure_diversity",
		title="Average Exposure Diversity Over Time by Scenario",
		ylabel="Average Exposure Diversity",
		output_filename="scenario_diversity.png",
	)
	plot_scenario_comparison(
		df,
		column="mean_belief",
		title="Mean Belief Over Time by Scenario",
		ylabel="Mean Belief",
		output_filename="scenario_mean_belief.png",
	)

	print(f"Scenario comparison plots saved to: {PLOTS_DIR} - plots.py:198")


def main() -> None:
	"""Generate all available plots from single-run and experiment outputs."""
	os.makedirs(PLOTS_DIR, exist_ok=True)

	generated_any = False

	if os.path.exists(SIMULATION_FILE):
		generate_single_run_plots()
		generated_any = True

	if os.path.exists(EXPERIMENT_FILE):
		generate_experiment_plots()
		generated_any = True

	if not generated_any:
		print("No input files found. - plots.py:216")
		print(f"Expected either: {SIMULATION_FILE} - plots.py:217")
		print(f"or: {EXPERIMENT_FILE} - plots.py:218")


if __name__ == "__main__":
	main()
