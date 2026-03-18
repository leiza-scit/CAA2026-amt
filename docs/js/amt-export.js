// ============================================================
// AMT - Academic Meta Tool
// amt-export.js - Export functions: TTL download + Cypher
// Depends on: amt-render.js (_AMT state), amt.js (StrID)
// ============================================================

// ------------------------------------------------------------
// Helper: strip a full IRI down to its local name
// e.g. "http://github.com/leiza-scit/CAA2026-amt/Potter_A" -> "Potter_A"
// ------------------------------------------------------------
var localName = function (iri) {
  var ex = _AMT.prefix;
  if (iri && iri.startsWith(ex)) return iri.slice(ex.length);
  // fallback: take everything after last # or /
  return iri ? iri.replace(/^.*[#\/]/, "") : iri;
};

// ------------------------------------------------------------
// Helper: safe Cypher identifier (Neo4J relationship types and
// node labels must be alphanumeric + underscore)
// ------------------------------------------------------------
var cypherSafe = function (str) {
  return str.replace(/[^a-zA-Z0-9_]/g, "_");
};

// ------------------------------------------------------------
// Helper: trigger a browser file download
// ------------------------------------------------------------
var downloadFile = function (filename, content, mimeType) {
  var blob = new Blob([content], { type: mimeType });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// ------------------------------------------------------------
// getReasonedGraph: returns graph with reasoning applied if
// reasoning is currently ON, otherwise the original graph.
// Always includes ALL edges (original + inferred).
// ------------------------------------------------------------
var getReasonedGraph = function () {
  // Get original graph (no reasoning) for baseline nodes/edges
  var base = _AMT.amt.getGraph(false, false);
  // Get reasoned graph for full edge set
  var reasoned = _AMT.amt.getGraph(true, false);
  return {
    nodes: reasoned.nodes,
    edges: reasoned.edges,
    baseEdgeCount: base.edges.length,
  };
};

// ------------------------------------------------------------
// ttlLiteral: format a string as a Turtle string literal,
// escaping internal quotes and newlines
// ------------------------------------------------------------
var ttlLiteral = function (str) {
  return (
    '"' +
    String(str)
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\n") +
    '"'
  );
};

// ------------------------------------------------------------
// ttlDouble: format a number as an xsd:double literal
// ------------------------------------------------------------
var ttlDouble = function (w) {
  var v = typeof w === "number" ? w : parseFloat(w) || 0;
  if (v > 1.0) v = 1.0;
  // always emit with enough precision, never Infinity
  return ttlLiteral(v.toFixed(6)) + "^^xsd:double";
};

// ------------------------------------------------------------
// exportTTL: full standalone Turtle serialisation
//
// Sections:
//   1. Prefixes
//   2. AMT meta-ontology (vocabulary classes & properties)
//   3. Domain model (Concepts, Roles, Axioms) – read from LocalStore
//   4. Instance data (original assertions)
//   5. Inferred assertions (reasoning results, tagged amt:inferred)
// ------------------------------------------------------------
var exportTTL = function () {
  var ex = _AMT.prefix;
  var AMT = "http://academic-meta-tool.xyz/vocab#";
  var RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
  var RDFS = "http://www.w3.org/2000/01/rdf-schema#";
  var XSD = "http://www.w3.org/2001/XMLSchema#";

  var rg = getReasonedGraph();
  var nodes = rg.nodes;
  var edges = rg.edges;
  var baseEdgeCount = rg.baseEdgeCount;

  var lines = [];
  var sep = function () {
    lines.push("");
  };

  // ── 1. Prefixes ────────────────────────────────────────────
  lines.push("@prefix amt:  <" + AMT + "> .");
  lines.push("@prefix rdf:  <" + RDF + "> .");
  lines.push("@prefix rdfs: <" + RDFS + "> .");
  lines.push("@prefix xsd:  <" + XSD + "> .");
  lines.push("@prefix ex:   <" + ex + "> .");
  sep();

  // ── 2. AMT meta-ontology ───────────────────────────────────
  lines.push("# ── AMT Meta-Ontology ────────────────────────────────────");
  sep();

  lines.push("amt:Concept");
  lines.push("    rdfs:subClassOf rdfs:Class .");
  sep();

  lines.push("amt:Role");
  lines.push("    rdfs:subClassOf rdf:Property .");
  sep();

  lines.push("amt:Axiom");
  lines.push("    rdfs:subClassOf rdfs:Class .");
  sep();

  lines.push("amt:InferenceAxiom");
  lines.push("    rdfs:subClassOf amt:Axiom .");
  sep();

  lines.push("amt:IntegrityAxiom");
  lines.push("    rdfs:subClassOf amt:Axiom .");
  sep();

  lines.push("amt:RoleChainAxiom");
  lines.push("    rdfs:subClassOf amt:InferenceAxiom .");
  sep();

  lines.push("amt:InverseAxiom");
  lines.push("    rdfs:subClassOf amt:InferenceAxiom .");
  sep();

  lines.push("amt:DisjointAxiom");
  lines.push("    rdfs:subClassOf amt:IntegrityAxiom .");
  sep();

  lines.push("amt:SelfDisjointAxiom");
  lines.push("    rdfs:subClassOf amt:IntegrityAxiom .");
  sep();

  lines.push("amt:Logic");
  lines.push("    rdfs:subClassOf rdfs:Class .");
  sep();

  lines.push("amt:LukasiewiczLogic");
  lines.push("    rdf:type amt:Logic .");
  sep();

  lines.push("amt:ProductLogic");
  lines.push("    rdf:type amt:Logic .");
  sep();

  lines.push("amt:GoedelLogic");
  lines.push("    rdf:type amt:Logic .");
  sep();

  // ── 3. Domain model from LocalStore ────────────────────────
  lines.push("# ── Domain Model ─────────────────────────────────────────");

  // Helper: read from LocalStore using known predicate IRIs
  var P_TYPE = RDF + "type";
  var P_LABEL = RDFS + "label";
  var P_SUBCLASSOF = RDFS + "subClassOf";
  var P_DOMAIN = RDFS + "domain";
  var P_RANGE = RDFS + "range";
  var C_CONCEPT = AMT + "Concept";
  var C_ROLE = AMT + "Role";
  var P_PLACEHOLDER = AMT + "placeholder";
  var P_INSTANCEOF = AMT + "instanceOf";
  var P_ANT1 = AMT + "antecedent1";
  var P_ANT2 = AMT + "antecedent2";
  var P_ANT = AMT + "antecedent";
  var P_CONS = AMT + "consequent";
  var P_LOGIC = AMT + "logic";
  var P_INV = AMT + "inverse";
  var P_ROLE1 = AMT + "role1";
  var P_ROLE2 = AMT + "role2";

  // Helper: shorten an IRI to prefixed form for output
  var pfx = function (iri) {
    if (!iri) return iri;
    if (iri.startsWith(ex)) return "ex:" + iri.slice(ex.length);
    if (iri.startsWith(AMT)) return "amt:" + iri.slice(AMT.length);
    if (iri.startsWith(RDF)) return "rdf:" + iri.slice(RDF.length);
    if (iri.startsWith(RDFS)) return "rdfs:" + iri.slice(RDFS.length);
    if (iri.startsWith(XSD)) return "xsd:" + iri.slice(XSD.length);
    return "<" + iri + ">";
  };

  // 3a. Concepts
  sep();
  lines.push("# Concepts");
  var conceptIRIs = LocalStore.subjectsOf(P_TYPE, C_CONCEPT);
  conceptIRIs.forEach(function (c) {
    var label = LocalStore.objectOf(c, P_LABEL);
    var placeholder = LocalStore.objectOf(c, P_PLACEHOLDER);
    lines.push(pfx(c));
    lines.push("    rdf:type          amt:Concept ;");
    if (label) lines.push("    rdfs:label        " + ttlLiteral(label) + " ;");
    if (placeholder)
      lines.push("    amt:placeholder   " + ttlLiteral(placeholder) + " ;");
    // remove trailing semicolon from last predicate
    lines[lines.length - 1] = lines[lines.length - 1].replace(/ ;$/, " .");
    sep();
  });

  // 3b. Roles
  lines.push("# Roles");
  var roleIRIs = LocalStore.subjectsOf(P_TYPE, C_ROLE);
  roleIRIs.forEach(function (r) {
    var label = LocalStore.objectOf(r, P_LABEL);
    var domain = LocalStore.objectOf(r, P_DOMAIN);
    var range = LocalStore.objectOf(r, P_RANGE);
    lines.push(pfx(r));
    lines.push("    rdf:type      amt:Role ;");
    if (label) lines.push("    rdfs:label    " + ttlLiteral(label) + " ;");
    if (domain) lines.push("    rdfs:domain   " + pfx(domain) + " ;");
    if (range) lines.push("    rdfs:range    " + pfx(range) + " ;");
    lines[lines.length - 1] = lines[lines.length - 1].replace(/ ;$/, " .");
    sep();
  });

  // 3c. Axioms – collect all axiom types
  lines.push("# Axioms");
  var C_AXIOM = AMT + "Axiom";
  var axiomSubclasses = LocalStore.subjectsOf(P_SUBCLASSOF, C_AXIOM);
  var allAxiomTypes = [];
  axiomSubclasses.forEach(function (cls) {
    allAxiomTypes.push(cls);
    LocalStore.subjectsOf(P_SUBCLASSOF, cls).forEach(function (c2) {
      if (allAxiomTypes.indexOf(c2) < 0) allAxiomTypes.push(c2);
    });
  });
  allAxiomTypes.forEach(function (axiomType) {
    LocalStore.subjectsOf(P_TYPE, axiomType).forEach(function (axiom) {
      var ant1 = LocalStore.objectOf(axiom, P_ANT1);
      var ant2 = LocalStore.objectOf(axiom, P_ANT2);
      var ant = LocalStore.objectOf(axiom, P_ANT);
      var cons = LocalStore.objectOf(axiom, P_CONS);
      var logic = LocalStore.objectOf(axiom, P_LOGIC);
      var inv = LocalStore.objectOf(axiom, P_INV);
      var r1 = LocalStore.objectOf(axiom, P_ROLE1);
      var r2 = LocalStore.objectOf(axiom, P_ROLE2);
      lines.push(pfx(axiom));
      lines.push("    rdf:type          " + pfx(axiomType) + " ;");
      if (ant1) lines.push("    amt:antecedent1   " + pfx(ant1) + " ;");
      if (ant2) lines.push("    amt:antecedent2   " + pfx(ant2) + " ;");
      if (ant) lines.push("    amt:antecedent    " + pfx(ant) + " ;");
      if (cons) lines.push("    amt:consequent    " + pfx(cons) + " ;");
      if (logic) lines.push("    amt:logic         " + pfx(logic) + " ;");
      if (inv) lines.push("    amt:inverse       " + pfx(inv) + " ;");
      if (r1) lines.push("    amt:role1         " + pfx(r1) + " ;");
      if (r2) lines.push("    amt:role2         " + pfx(r2) + " ;");
      lines[lines.length - 1] = lines[lines.length - 1].replace(/ ;$/, " .");
      sep();
    });
  });

  // ── 4. Instance data ───────────────────────────────────────
  lines.push("# ── Instances ────────────────────────────────────────────");
  sep();
  nodes.forEach(function (n) {
    lines.push(pfx(n.id));
    lines.push("    amt:instanceOf  " + pfx(n.concept) + " ;");
    lines.push("    rdfs:label      " + ttlLiteral(n.label) + " .");
    sep();
  });

  // ── 5. Assertions (original) ───────────────────────────────
  lines.push("# ── Original Assertions ──────────────────────────────────");
  sep();
  for (var j = 0; j < Math.min(baseEdgeCount, edges.length); j++) {
    var e = edges[j];
    var bnode = "_:a" + (j + 1);
    lines.push(bnode);
    lines.push("    rdf:subject   " + pfx(e.from) + " ;");
    lines.push("    rdf:predicate " + pfx(e.role) + " ;");
    lines.push("    rdf:object    " + pfx(e.to) + " ;");
    lines.push("    amt:weight    " + ttlDouble(e.width) + " .");
    sep();
  }

  // ── 6. Inferred assertions ─────────────────────────────────
  if (edges.length > baseEdgeCount) {
    lines.push("# ── Inferred Assertions (Reasoning) ─────────────────────");
    sep();
    for (var k = baseEdgeCount; k < edges.length; k++) {
      var ei = edges[k];
      var bi = "_:i" + (k - baseEdgeCount + 1);
      lines.push(bi);
      lines.push("    rdf:subject    " + pfx(ei.from) + " ;");
      lines.push("    rdf:predicate  " + pfx(ei.role) + " ;");
      lines.push("    rdf:object     " + pfx(ei.to) + " ;");
      lines.push("    amt:weight     " + ttlDouble(ei.width) + " ;");
      lines.push('    amt:inferred   "true"^^xsd:boolean .');
      sep();
    }
  }

  var content = lines.join("\r\n").replace(/Infinity/g, "1.000000");
  downloadFile("amt-graph-standalone.ttl", content, "text/turtle");
  console.log(
    "Standalone TTL export: " +
      nodes.length +
      " nodes, " +
      edges.length +
      " edges (" +
      (edges.length - baseEdgeCount) +
      " inferred)",
  );
};

// ------------------------------------------------------------
// exportCypher: serialise current graph as Neo4J Cypher
//
// Strategy:
//   - Each node  → MERGE (n:ConceptType {id: "...", label: "..."})
//   - Each edge  → MERGE (a)-[:ROLE_TYPE {weight: x, inferred: bool}]->(b)
//   - Inferred edges get an extra property inferred: true
// ------------------------------------------------------------
var exportCypher = function () {
  var ex = _AMT.prefix;
  var rg = getReasonedGraph();
  var nodes = rg.nodes;
  var edges = rg.edges;
  var baseEdgeCount = rg.baseEdgeCount;

  // Build a map: full IRI -> safe Cypher variable name
  var varMap = {};
  var lines = [];

  lines.push("// AMT Potter Attribution - Neo4J Cypher export");
  lines.push("// Generated: " + new Date().toISOString());
  lines.push(
    "// Nodes: " +
      nodes.length +
      "  |  Edges: " +
      edges.length +
      "  (inferred: " +
      (edges.length - baseEdgeCount) +
      ")",
  );
  lines.push("");

  // --- Nodes ---
  lines.push("// --- Nodes ---");
  for (var i in nodes) {
    var n = nodes[i];
    var varName = cypherSafe(localName(n.id));
    var label = cypherSafe(localName(n.concept));
    varMap[n.id] = varName;
    lines.push(
      "MERGE (" +
        varName +
        ":" +
        label +
        " {" +
        'id: "' +
        localName(n.id) +
        '", ' +
        'label: "' +
        n.label.replace(/"/g, '\\"') +
        '", ' +
        'concept: "' +
        localName(n.concept) +
        '"' +
        "});",
    );
  }
  lines.push("");

  // --- Original edges ---
  lines.push("// --- Original assertions ---");
  for (var j = 0; j < Math.min(baseEdgeCount, edges.length); j++) {
    var e = edges[j];
    var w = typeof e.width === "number" ? e.width : parseFloat(e.width) || 0;
    if (w > 1.0) w = 1.0;
    var relType = cypherSafe(localName(e.role)).toUpperCase();
    var fromVar = varMap[e.from] || cypherSafe(localName(e.from));
    var toVar = varMap[e.to] || cypherSafe(localName(e.to));
    lines.push(
      "MERGE (" +
        fromVar +
        ")-[:" +
        relType +
        " {" +
        "weight: " +
        w +
        ", " +
        'role: "' +
        localName(e.role) +
        '", ' +
        "inferred: false" +
        "}]->(" +
        toVar +
        ");",
    );
  }

  // --- Inferred edges ---
  if (edges.length > baseEdgeCount) {
    lines.push("");
    lines.push("// --- Inferred assertions (reasoning) ---");
    for (var k = baseEdgeCount; k < edges.length; k++) {
      var ei = edges[k];
      var wi =
        typeof ei.width === "number" ? ei.width : parseFloat(ei.width) || 0;
      if (wi > 1.0) wi = 1.0;
      var relTypei = cypherSafe(localName(ei.role)).toUpperCase();
      var fromVari = varMap[ei.from] || cypherSafe(localName(ei.from));
      var toVari = varMap[ei.to] || cypherSafe(localName(ei.to));
      lines.push(
        "MERGE (" +
          fromVari +
          ")-[:" +
          relTypei +
          " {" +
          "weight: " +
          wi +
          ", " +
          'role: "' +
          localName(ei.role) +
          '", ' +
          "inferred: true" +
          "}]->(" +
          toVari +
          ");",
      );
    }
  }

  var content = lines.join("\r\n");
  downloadFile("amt-graph-reasoned.cypher", content, "text/plain");
  console.log(
    "Cypher export done:",
    edges.length,
    "edges (" + (edges.length - baseEdgeCount) + " inferred)",
  );
};
