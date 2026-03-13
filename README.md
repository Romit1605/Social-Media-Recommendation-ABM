# Social Media Recommendation ABM

An Agent-Based Model (ABM) of social media recommendation systems built with Python, Mesa, FastAPI, and React.

This project simulates how recommendation algorithms can influence:
- echo chamber formation
- ideological polarization
- misinformation spread
- exposure diversity

## Features

- Agent-based simulation with:
  - Users
  - Content Creators
  - Recommendation Algorithm
- Interactive React dashboard
- Scenario-based experiments:
  - Baseline
  - High Engagement Optimization
  - Strong Personalization Bias
  - Diversity Injection
- Live network visualization
- Time-series charts
- Scenario comparison
- Simulation summary
- CSV / PNG export

---

## Tech Stack

### Backend
- Python
- Mesa
- FastAPI
- NetworkX
- Pandas
- NumPy

### Frontend
- React
- Vite
- Axios
- Recharts
- react-force-graph

---

## Project Structure

```text
Social-Media-Recommendation-ABM/
│
├── agents/              # agent definitions
├── analysis/            # metrics and experiment analysis
├── model/               # model logic and network builder
├── data/                # outputs / saved results
├── frontend/            # React dashboard
├── api.py               # FastAPI backend
├── config.py            # simulation configuration
├── requirements.txt     # Python dependencies
├── README.md
└── .gitignore
