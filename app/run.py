"""
Entry point for the Algorithmic Echo Chambers simulation.

Usage:
    python -m app.run
    python app/run.py
"""

import os
import sys

import pandas as pd

# Ensure the project root is importable when running as a script
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from config import SimulationConfig
from model.social_model import SocialMediaModel

OUTPUT_DIR = os.path.join("data", "outputs")
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "simulation_metrics.csv")


def main() -> None:
    """Run the simulation end-to-end and save metrics to CSV."""

    # 1. Configuration
    config = SimulationConfig()
    print(f"Starting simulation: {config.num_users} users, - run.py:29"
          f"{config.num_creators} creators, "
          f"{config.simulation_steps} steps")

    # 2. Initialise model
    model = SocialMediaModel(config)

    # 3. Run simulation
    for step in range(config.simulation_steps):
        model.step()
        if (step + 1) % 50 == 0 or step == 0:
            print(f"step {step + 1}/{config.simulation_steps} completed - run.py:40")

    # 4. Collect metrics into a DataFrame
    df = pd.DataFrame(model.metrics)

    # 5. Ensure output directory exists
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # 6. Save to CSV
    df.to_csv(OUTPUT_FILE, index=False)

    # 7. Summary
    print(f"\nSimulation finished  {model.steps} steps completed. - run.py:52")
    print(f"Output saved to: {OUTPUT_FILE} - run.py:53")
    print(f"\nFinal metrics: - run.py:54")
    print(df.iloc[-1].to_string())


if __name__ == "__main__":
    main()
