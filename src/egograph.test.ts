// Copyright 2020 Janos Veres. All rights reserved.
// Use of this source code is governed by an MIT-style
// license that can be found in the LICENSE file.

import {
  assertArrayIncludes,
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.126.0/testing/asserts.ts";

Deno.test({
  name: "EgoGraph builder, defaults",
  async fn(): Promise<void> {
    const mod = await import("./egograph.ts");
    const ego = new mod.EgoGraph();
    const graph = ego.toObject();
    assertEquals(graph, {
      format: "json",
      graph: '{"nodes":[],"links":[]}',
      depth: 1,
      elapsedMs: 0,
      maxDistance: -Infinity,
      maxWeight: -Infinity,
      pattern: " vs ",
      query: "",
      radius: 10,
    });
  },
});

Deno.test({
  name: "EgoGraph: query='okr', radius=1",
  async fn(): Promise<void> {
    const mod = await import("./egograph.ts");
    const ego = new mod.EgoGraph({ query: "okr", radius: 1 });
    await ego.build();
    const graph = ego.toObject();
    assertExists(graph.graph);
    assertExists(graph.format);
    const G = JSON.parse(graph.graph);
    assertArrayIncludes(G.nodes, [{ id: "okr", count: 1, depth: 0 }]);
    assertEquals(graph.query, "okr");
    assertEquals(graph.depth, 1);
    assertEquals(graph.radius, 1);
    assertEquals(graph.maxWeight, 1);
    assertEquals(graph.maxDistance, 1);
    assertEquals(graph.pattern, " vs ");
    assertExists(graph.elapsedMs);
  },
});

Deno.test({
  name: "EgoGraph: query='devops', depth=2, radius=3, format='json'",
  async fn(): Promise<void> {
    const mod = await import("./egograph.ts");
    const ego = new mod.EgoGraph({
      query: "devops",
      depth: 2,
      radius: 3,
      format: "json",
    });
    await ego.build();
    const graph = ego.toObject();
    assertEquals(graph.query, "devops");
    assertEquals(graph.depth, 2);
    assertEquals(graph.format, "json");
    assertEquals(graph.radius, 3);
    assertEquals(graph.pattern, " vs ");
    assertExists(graph.elapsedMs);
  },
});
