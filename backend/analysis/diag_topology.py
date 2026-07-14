"""
Decisive test: build the graph from the OFFICIAL topology instead of geometry.

Each LINK row carries BGNG_LNKG_ID and END_LNKG_ID (its two endpoint IDs).
If we make one graph edge per link between those two IDs, links that meet at a
junction share an endpoint ID and connect - no geometry guessing.

We fetch the whole Jongno district and count connected components.
"""

import sys

sys.path.insert(0, ".")
import networkx as nx  # noqa: E402

from offline.db import get_seoul_key  # noqa: E402
from offline.scrapers.seoul_paths_collector import fetch_page  # noqa: E402

key = get_seoul_key()
total = fetch_page(key, 1, 1).get("list_total_count", 0)
print(f"Jongno total rows: {total} - paging by 1000 ...")

G = nx.Graph()
n_links = 0
start = 1
while start <= total:
    end = min(start + 999, total)
    rows = fetch_page(key, start, end).get("row", [])
    for r in rows:
        if r.get("NODE_TYPE") != "LINK":
            continue
        try:
            a = int(float(r["BGNG_LNKG_ID"]))
            b = int(float(r["END_LNKG_ID"]))
        except (TypeError, ValueError, KeyError):
            continue
        G.add_edge(a, b, link=int(float(r["LNKG_ID"])))
        n_links += 1
    start = end + 1

comps = sorted(nx.connected_components(G), key=len, reverse=True)
print(f"\nLinks used: {n_links}")
print(f"Nodes (endpoint IDs): {G.number_of_nodes()}")
print(f"Components: {len(comps)}")
print(f"Largest: {len(comps[0])} nodes "
      f"({100*len(comps[0])/G.number_of_nodes():.1f}%)")
print("Top 5 component sizes:", [len(c) for c in comps[:5]])
