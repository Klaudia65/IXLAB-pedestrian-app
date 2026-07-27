"""
Export a COMPACT ROUTING GRAPH for the web app's in-browser path finder.

Background
----------
The vibe search in web/frontend/app/realmap.jsx ranks NAMED STREETS into a list.
The next step (routing) turns the user's start point + a time budget (~38 min)
into an actual WALKING PATH that maximises the vibe encountered on the way -- an
open orienteering path (start fixed, end anywhere). That search runs in the
browser, so it needs the pedestrian network as a small JSON, not the graphml.

This script joins two artifacts we already have:

    backend/analysis/out/walk_graph.graphml          the OSMnx pedestrian network
    web/frontend/scores-named-streets-jongno.geojson  the 6 vibe axes per street

The graph's edge `name` matches the scored street `name` exactly (verified:
307/307 scored streets are present as graph edge names), so each edge inherits the
6 axis scores of the street it belongs to -- or nulls when that street carries no
score. The browser then computes an edge reward = dot(slider weights, the edge's
percentile-normalised axis scores), reusing the SAME normalisation the ranker uses
so the "list" and the "path" agree.

Output (web/frontend/walk-net-jongno.json)
------------------------------------------
    {
      "axes":     [ ...6 axis names, in a fixed order... ],
      "names":    [ ...distinct street names... ],       # index space for edges
      "nameAxes": [ [a0..a5|null], ... ]                 # per name, aligned to `names`
      "nodes":    [ [lng, lat], ... ]                    # index = node id in edges
      "edges":    [ [u, v, length_m, nameId], ... ]      # undirected u<v; nameId=-1 unnamed
    }

Axes live once per NAME (not per edge): every edge of a street shares that street's
scores, so a name table keeps the file small and lets the browser both (a) reward
edges by their street's vibe and (b) print the street names the walk passes through.
Pedestrians ignore oneway, so the directed graph is collapsed to undirected edges
(one entry per unordered pair, shortest length kept). Coords are rounded to 6 dp
(~0.1 m) and lengths to 1 dp to keep the file small.

Run:  python -m offline.export_route_graph
"""

import json
import pathlib

import networkx as nx

ROOT = pathlib.Path(__file__).resolve().parents[2]
GRAPHML = ROOT / "backend" / "analysis" / "out" / "walk_graph.graphml"
SCORES = ROOT / "web" / "frontend" / "scores-named-streets-jongno.geojson"
OUT = ROOT / "web" / "frontend" / "walk-net-jongno.json"

# Fixed axis order -- the frontend maps its slider weights onto these indices.
# Must match the axis columns in scores-named-streets-jongno.geojson (and the
# VIBE_AXIS_MAP values in realmap.jsx).
AXES = [
    "touristy_local",
    "historic_contemporary",
    "raw_polished",
    "quiet_lively",
    "local_chain",
    "park",
]


def load_street_axes():
    """name -> [6 axis values, each float or None], from the scored streets."""
    gj = json.loads(SCORES.read_text(encoding="utf-8"))
    out = {}
    for f in gj.get("features", []):
        p = f.get("properties") or {}
        name = p.get("name")
        if not name:
            continue
        out[name] = [
            (None if p.get(ax) is None else float(p[ax])) for ax in AXES
        ]
    return out


def main():
    G = nx.read_graphml(GRAPHML)
    street_axes = load_street_axes()

    # --- nodes: stable id -> compact integer index, with [lng, lat] ---
    node_ids = list(G.nodes())
    idx = {nid: i for i, nid in enumerate(node_ids)}
    nodes = [
        [round(float(G.nodes[nid]["x"]), 6), round(float(G.nodes[nid]["y"]), 6)]
        for nid in node_ids
    ]

    # --- edges: collapse directed -> undirected (u<v), keep the shortest length,
    #     remember each edge's street name ---
    best = {}  # (u,v) with u<v -> (length_m, name)
    for u, v, d in G.edges(data=True):
        iu, iv = idx[u], idx[v]
        if iu == iv:
            continue
        key = (iu, iv) if iu < iv else (iv, iu)
        length = float(d.get("length", 0.0))
        name = d.get("name")
        # graphml may store name as a list when an edge merges ways; take the first
        if isinstance(name, list):
            name = name[0] if name else None
        prev = best.get(key)
        if prev is None or length < prev[0]:
            best[key] = (length, name)

    # --- name table: distinct street names -> index, with the street's 6 axes ---
    name_ids = {}          # name -> index
    names = []             # index -> name
    name_axes = []         # index -> [6 axis values | None]

    def name_id(name):
        if name is None:
            return -1
        if name not in name_ids:
            name_ids[name] = len(names)
            names.append(name)
            name_axes.append(street_axes.get(name, [None] * len(AXES)))
        return name_ids[name]

    edges = []
    for (u, v), (length, name) in best.items():
        edges.append([u, v, round(length, 1), name_id(name)])

    OUT.write_text(
        json.dumps(
            {"axes": AXES, "names": names, "nameAxes": name_axes,
             "nodes": nodes, "edges": edges},
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    scored_names = sum(1 for a in name_axes if any(x is not None for x in a))
    scored_edges = sum(1 for e in edges if e[3] >= 0 and any(x is not None for x in name_axes[e[3]]))
    print(f"wrote {OUT.relative_to(ROOT)}")
    print(f"  nodes: {len(nodes)}")
    print(f"  edges: {len(edges)} (undirected)")
    print(f"  names: {len(names)} distinct ({scored_names} carry vibe scores)")
    print(f"  edges with a scored street: {scored_edges} "
          f"({100 * scored_edges / max(1, len(edges)):.0f}%)")
    print(f"  file size: {OUT.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
