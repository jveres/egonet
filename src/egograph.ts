// Copyright 2020 Janos Veres. All rights reserved.
// Use of this source code is governed by an MIT-style
// license that can be found in the LICENSE file.

// deno-lint-ignore-file no-explicit-any

import { Status } from "https://deno.land/std@0.123.0/http/http_status.ts";
import createGraph from "https://dev.jspm.io/ngraph.graph";
import { Retry, Timeout, Trace } from "https://deno.land/x/deco@0.9.5.6/mod.ts";

const FETCH_TIMEOUT_MS = 5000;
const FETCH_MAX_ATTEMPTS = 3;
const BUILD_TIMEOUT_MS = 10000;

export interface EgoGraphOptions {
  query: string;
  pattern?: string;
  depth?: number;
  radius?: number;
  format?: string;
}

export class EgoGraph {
  static readonly DEFAULT_GRAPH_DEPTH: number = 1;
  static readonly DEFAULT_SEARCH_PATTERN: string = " vs ";
  static readonly DEFAULT_GRAPH_RADIUS: number = 10;
  static readonly DEFAULT_GRAPH_FORMAT: string = "json";

  readonly query: string;
  readonly pattern: string;
  readonly depth: number;
  readonly radius: number;
  public readonly format: string;

  public readonly graph: any;

  private elapsedMs = 0;
  private maxDistance = Number.NEGATIVE_INFINITY;

  /**
   * Creates a new EgoGraph instance.
   * @constructor
   * @param {EgoGraphOptions} options - Options for creating the ego network.
   */
  constructor(options: EgoGraphOptions = { query: "" }) {
    this.graph = (createGraph as () => any)();
    this.query = options.query;
    this.depth = options.depth ?? EgoGraph.DEFAULT_GRAPH_DEPTH;
    this.pattern = options.pattern ?? EgoGraph.DEFAULT_SEARCH_PATTERN;
    this.radius = options.radius ?? EgoGraph.DEFAULT_GRAPH_RADIUS;
    this.format = options.format ?? EgoGraph.DEFAULT_GRAPH_FORMAT;
  }

  @Timeout({ timeout: FETCH_TIMEOUT_MS })
  @Retry({ maxAttempts: FETCH_MAX_ATTEMPTS })
  private async fetchAutocomplete(
    term: string,
    maxCount: number,
    signal: AbortSignal,
  ): Promise<Set<string>> {
    const q = term + this.pattern;
    const res = await fetch(
      `http://suggestqueries.google.com/complete/search?&client=firefox&gl=us&hl=en&q=${
        encodeURIComponent(q)
      }`,
      { signal },
    );
    if (res.status === Status.OK) {
      const hits = await res.json();
      const set = new Set<string>();
      for (const hit of hits[1].slice(0, maxCount)) {
        hit.split(this.pattern).slice(1).map((t: string) => {
          if (!new RegExp("^[0-9.]+$").test(t)) { // filters
            set.add(t);
          }
        });
      }
      return set;
    } else {
      throw new Error(`Fetch error: ${res.status} ${res.statusText}`);
    }
  }

  /**
   * Builds the ego network.
   * @returns {void}
   */
  @Trace()
  @Timeout({
    timeout: BUILD_TIMEOUT_MS,
    onTimeout() {
      console.error("build() timed out");
    },
  })
  async build() {
    if (this.query === "") return;
    const t1 = performance.now();
    const { timeoutSignal } = arguments[0]; // timeoutSignal injected by @Timeout
    this.graph.beginUpdate();
    let sources: string[] = [this.query];
    let distances: number[] = [0];
    for (let depth = 0; depth < this.depth; depth++) {
      const nextSources: string[] = [];
      const nextDistances: number[] = [];
      for (let i = 0; i < sources.length; i++) {
        const srcDistance = distances[i];
        if (srcDistance >= this.radius) continue;
        const src = sources[i];
        const targets = await this.fetchAutocomplete(
          src,
          this.radius - srcDistance,
          timeoutSignal,
        );
        if (!this.graph.getNode(src)) {
          this.graph.addNode(src, {
            count: 1,
            depth: src === this.query ? 0 : depth + 1,
          }); // new node
        }
        let weight: number = targets.size;
        let distance = 1;
        targets.forEach((target: string) => {
          const dist = srcDistance + distance;
          if (dist > this.maxDistance) this.maxDistance = dist;
          const targetNode = this.graph.getNode(target);
          if (!targetNode) {
            this.graph.addNode(target, { count: 1, depth: depth + 1 });
            this.graph.addLink(
              src,
              target,
              {
                distance: dist,
                weight,
                query: `${src}${this.pattern}${target}`,
              },
            ); // new edge
            nextDistances.push(dist);
            nextSources.push(target);
          } else {
            targetNode.data.count++; // existing node
            const link1 = this.graph.getLink(src, target),
              link2 = this.graph.getLink(target, src);
            if (link1 || link2) {
              link1 ? link1.data.weight += weight : link2.data.weight += weight;
            } else {
              this.graph.addLink(
                src,
                target,
                {
                  distance: dist,
                  weight,
                  query: `${src}${this.pattern}${target}`,
                },
              ); // existing edge
            }
          }
          weight -= 1;
          distance += 1;
        });
      }
      sources = nextSources;
      distances = nextDistances;
    }
    this.graph.endUpdate();
    this.elapsedMs = performance.now() - t1;
  }

  /**
   * Creates final object representation of the graph. Should be called after build().
   * @returns {object} {graph, format, query, depth, radius, maxWeight, maxDistance, pattern, elapsedMs}
   */
  toObject(): { [index: string]: any } {
    let maxWeight = Number.NEGATIVE_INFINITY;
    this.graph.forEachLink((link: any) => {
      if (link.data.weight > maxWeight) maxWeight = link.data.weight;
    });
    return {
      graph: this.toString(),
      format: this.format,
      query: this.query,
      depth: this.depth,
      radius: this.radius,
      maxWeight,
      maxDistance: this.maxDistance,
      pattern: this.pattern,
      elapsedMs: this.elapsedMs,
    };
  }

  /**
   * Save the graph to string according to the specified format. Should be called after build().
   * @returns {string}
   */
  toString(): string {
    switch (this.format) {
      case "json":
        return this.toJSON();
      default:
        throw new Error(`unknown format "${this.format}"`);
    }
  }

  /**
   * Save the graph in simple JSON format: {nodes: [], links: []}. Should be called after build().
   * @returns {string}
   */
  toJSON(): string {
    const json = { nodes: [] as any[], links: [] as any[] };
    this.graph.forEachNode((node: any) => {
      json.nodes.push({ id: node.id, ...node.data });
    });
    this.graph.forEachLink((link: any) => {
      json.links.push({ source: link.fromId, target: link.toId, ...link.data });
    });
    return JSON.stringify(json);
  }
}
