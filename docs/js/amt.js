// ============================================================
// AMT - Academic Meta Tool
// amt.js - Local RDF/TTL version (no external triplestore)
// Uses N3.js for Turtle parsing, replaces RDF4J SPARQL queries
// with direct triple-pattern matching.
// ============================================================

function StrID() {
  var text = "";
  var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  for (var i = 0; i < 12; i++)
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  return text;
}

function UUID() {
  var dt = new Date().getTime();
  var uuid = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
    /[xy]/g,
    function (c) {
      var r = ((dt + Math.random() * 16) % 16) | 0;
      dt = Math.floor(dt / 16);
      return (c == "x" ? r : (r & 0x3) | 0x8).toString(16);
    },
  );
  return uuid;
}

function copyToClipboard(element) {
  var text = $(element).clone().find("br").prepend("\r\n").end().text();
  element = $("<textarea>").appendTo("body").val(text).select();
  document.execCommand("copy");
  element.remove();
}

// ============================================================
// LocalStore: loads a TTL file via fetch and provides
// triple-pattern lookups that mirror the original SPARQL queries.
// ============================================================

var LocalStore = (function () {
  var _triples = []; // [{subject, predicate, object}, ...]
  var _loaded = false;

  // Helper: resolve a prefixed name to full IRI using N3 prefix map
  function iri(value) {
    // N3.js returns full IRIs already; named nodes are wrapped in <>
    // Blank nodes start with "_:", literals are quoted strings.
    return value;
  }

  // Load the TTL file and parse with N3.js
  function load(ttlPath, callback) {
    fetch(ttlPath)
      .then(function (response) {
        if (!response.ok)
          throw new Error(
            "Failed to load TTL: " +
              ttlPath +
              " (HTTP " +
              response.status +
              ")",
          );
        return response.text();
      })
      .then(function (text) {
        var parser = new N3.Parser();
        _triples = [];
        parser.parse(text, function (error, quad, prefixes) {
          if (error) {
            console.error("N3 parse error:", error);
            callback(error);
            return;
          }
          if (quad) {
            _triples.push({
              subject: quad.subject.value,
              predicate: quad.predicate.value,
              object: quad.object.value,
            });
          } else {
            // quad === null means parsing is done
            _loaded = true;
            console.log("TTL loaded:", _triples.length, "triples");
            callback(null);
          }
        });
      })
      .catch(function (err) {
        console.error("Fetch error:", err);
        callback(err);
      });
  }

  // Return all triples matching the given pattern (null = wildcard)
  function match(s, p, o) {
    return _triples.filter(function (t) {
      return (
        (s === null || t.subject === s) &&
        (p === null || t.predicate === p) &&
        (o === null || t.object === o)
      );
    });
  }

  // Return the single object value for (s, p, *), or null
  function objectOf(s, p) {
    var results = match(s, p, null);
    return results.length > 0 ? results[0].object : null;
  }

  // Return all object values for (s, p, *)
  function objectsOf(s, p) {
    return match(s, p, null).map(function (t) {
      return t.object;
    });
  }

  // Return all subject values for (*, p, o)
  function subjectsOf(p, o) {
    return match(null, p, o).map(function (t) {
      return t.subject;
    });
  }

  return {
    load: load,
    match: match,
    objectOf: objectOf,
    objectsOf: objectsOf,
    subjectsOf: subjectsOf,
  };
})();

// ============================================================
// AMT constructor - mirrors original API surface exactly
// ============================================================

var AMT = function () {
  var CONCEPTS = [];
  var ROLES = [];
  var GRAPH = {
    original: { nodes: [], edges: [] },
    edited: { nodes: [], edges: [] },
  };
  var AXIOMS = [];

  // Vocabulary IRIs
  var PREFIX = "http://academic-meta-tool.xyz/vocab#";
  var PREFIX_INSTANCES = "http://rgzm.de/datingmechanism#";

  var RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
  var RDFS = "http://www.w3.org/2000/01/rdf-schema#";
  var AMT_NS = PREFIX;

  // Frequently used full IRIs
  var P_TYPE = RDF + "type";
  var P_LABEL = RDFS + "label";
  var P_SUBCLASSOF = RDFS + "subClassOf";
  var P_DOMAIN = RDFS + "domain";
  var P_RANGE = RDFS + "range";
  var P_SUBJECT = RDF + "subject";
  var P_PREDICATE = RDF + "predicate";
  var P_OBJECT = RDF + "object";

  var C_CONCEPT = AMT_NS + "Concept";
  var C_ROLE = AMT_NS + "Role";
  var C_AXIOM = AMT_NS + "Axiom";

  var P_INSTANCEOF = AMT_NS + "instanceOf";
  var P_PLACEHOLDER = AMT_NS + "placeholder";
  var P_WEIGHT = AMT_NS + "weight";
  var P_ANTECEDENT1 = AMT_NS + "antecedent1";
  var P_ANTECEDENT2 = AMT_NS + "antecedent2";
  var P_ANTECEDENT = AMT_NS + "antecedent";
  var P_CONSEQUENT = AMT_NS + "consequent";
  var P_LOGIC = AMT_NS + "logic";
  var P_INVERSE = AMT_NS + "inverse";
  var P_ROLE1 = AMT_NS + "role1";
  var P_ROLE2 = AMT_NS + "role2";
  var P_ROLE = AMT_NS + "role";

  // Path to the TTL data file (relative to docs/index.htm)
  var TTL_PATH = "data/LimesExample.ttl";

  // --------------------------------------------------------
  // loadGraph: replaces the 5 SPARQL queryStore() calls
  // --------------------------------------------------------
  var loadGraph = function (callback) {
    LocalStore.load(TTL_PATH, function (err) {
      if (err) {
        console.error("Could not load TTL:", err);
        callback({ nodes: [], edges: [] });
        return;
      }

      var graph = {};

      // ---- 1. CONCEPTS --------------------------------
      // Original SPARQL:
      //   SELECT ?concept ?label ?placeholder WHERE {
      //     ?concept rdf:type amt:Concept .
      //     ?concept rdfs:label ?label .
      //     ?concept amt:placeholder ?placeholder . }
      CONCEPTS = [];
      var conceptSubjects = LocalStore.subjectsOf(P_TYPE, C_CONCEPT);
      conceptSubjects.forEach(function (concept) {
        var label = LocalStore.objectOf(concept, P_LABEL);
        var placeholder = LocalStore.objectOf(concept, P_PLACEHOLDER);
        if (label !== null) {
          CONCEPTS.push({
            concept: concept,
            label: label,
            placeholder: placeholder,
          });
        }
      });
      console.log("CONCEPTS", CONCEPTS);

      // ---- 2. ROLES -----------------------------------
      // Original SPARQL:
      //   SELECT ?role ?label ?domain ?range WHERE {
      //     ?role rdf:type amt:Role .
      //     ?role rdfs:label ?label .
      //     ?role rdfs:domain ?domain .
      //     ?role rdfs:range ?range . }
      //   ORDER BY ASC(?label)
      ROLES = [];
      var roleSubjects = LocalStore.subjectsOf(P_TYPE, C_ROLE);
      roleSubjects.forEach(function (role) {
        var label = LocalStore.objectOf(role, P_LABEL);
        var domain = LocalStore.objectOf(role, P_DOMAIN);
        var range = LocalStore.objectOf(role, P_RANGE);
        if (label !== null) {
          ROLES.push({
            role: role,
            label: label,
            domain: domain,
            range: range,
          });
        }
      });
      ROLES.sort(function (a, b) {
        return a.label.localeCompare(b.label);
      });
      console.log("ROLES", ROLES);

      // ---- 3. NODES -----------------------------------
      // Original SPARQL:
      //   SELECT ?id ?label ?concept WHERE {
      //     ?concept rdf:type amt:Concept .
      //     ?id amt:instanceOf ?concept .
      //     ?id rdfs:label ?label . }
      var allNodes = [];
      conceptSubjects.forEach(function (concept) {
        var instances = LocalStore.subjectsOf(P_INSTANCEOF, concept);
        instances.forEach(function (id) {
          var label = LocalStore.objectOf(id, P_LABEL);
          if (label !== null) {
            allNodes.push({ id: id, label: label, concept: concept });
          }
        });
      });

      // Filter by mode (mirrors original example1-6 logic)
      graph.nodes = filterNodes(allNodes);
      console.log("NODES", graph.nodes);

      // ---- 4. EDGES -----------------------------------
      // Original SPARQL:
      //   SELECT ?role ?from ?to ?width WHERE {
      //     ?role rdf:type amt:Role .
      //     ?stmt rdf:subject ?from .
      //     ?stmt rdf:predicate ?role .
      //     ?stmt rdf:object ?to .
      //     ?stmt amt:weight ?width . }
      var allEdges = [];
      // Find all blank nodes / statements that carry a weight
      var weightTriples = LocalStore.match(null, P_WEIGHT, null);
      weightTriples.forEach(function (wt) {
        var stmt = wt.subject;
        var from = LocalStore.objectOf(stmt, P_SUBJECT);
        var role = LocalStore.objectOf(stmt, P_PREDICATE);
        var to = LocalStore.objectOf(stmt, P_OBJECT);
        var width = parseFloat(wt.object);
        if (from && role && to && !isNaN(width)) {
          allEdges.push({ role: role, from: from, to: to, width: width });
        }
      });

      graph.edges = filterEdges(allEdges);
      console.log("EDGES", graph.edges);

      // ---- 5. AXIOMS ----------------------------------
      // Original SPARQL:
      //   SELECT * WHERE {
      //     ?axiom rdf:type ?type .
      //     ?type rdfs:subClassOf ?grp .
      //     ?grp rdfs:subClassOf amt:Axiom .
      //     ?axiom ?p ?o . }
      AXIOMS = [];

      // Collect all classes that are (direct or indirect) subclasses of amt:Axiom
      var axiomSubclasses = LocalStore.subjectsOf(P_SUBCLASSOF, C_AXIOM);
      // also indirect (e.g. RoleChainAxiom -> InferenceAxiom -> Axiom)
      var allAxiomTypes = new Set();
      axiomSubclasses.forEach(function (cls) {
        allAxiomTypes.add(cls);
        var sub2 = LocalStore.subjectsOf(P_SUBCLASSOF, cls);
        sub2.forEach(function (c2) {
          allAxiomTypes.add(c2);
        });
      });

      allAxiomTypes.forEach(function (axiomType) {
        var axiomInstances = LocalStore.subjectsOf(P_TYPE, axiomType);
        axiomInstances.forEach(function (axiom) {
          var entry = {};
          // type shortname (strip PREFIX)
          entry.type = axiomType.startsWith(PREFIX)
            ? axiomType.substr(PREFIX.length)
            : axiomType;

          // collect all predicates for this axiom
          var allProps = LocalStore.match(axiom, null, null);
          allProps.forEach(function (t) {
            if (t.predicate === P_TYPE) return; // already handled
            var key = t.predicate.startsWith(PREFIX)
              ? t.predicate.substr(PREFIX.length)
              : t.predicate;
            entry[key] = t.object;
          });
          AXIOMS.push(entry);
        });
      });
      console.log("AXIOMS", AXIOMS);

      callback(graph);
    });
  };

  // --------------------------------------------------------
  // filterNodes / filterEdges: mirror original mode logic
  // --------------------------------------------------------
  var filterNodes = function (data) {
    if (_AMT.mode === "example1" || _AMT.mode === "example2") {
      return data.filter(function (item) {
        return item.id.includes("1");
      });
    }
    if (_AMT.mode === "example3" || _AMT.mode === "example4") {
      return data.filter(function (item) {
        return item.id.includes("2");
      });
    }
    if (_AMT.mode === "example5") {
      return data.filter(function (item) {
        return item.id.includes("3");
      });
    }
    if (_AMT.mode === "example6") {
      return data.filter(function (item) {
        return item.id.includes("4");
      });
    }
    return data;
  };

  var filterEdges = function (data) {
    var prefix = _AMT.prefix;
    if (_AMT.mode === "example1") {
      return data.filter(function (item) {
        return item.role === prefix + "d" || item.role === prefix + "a";
      });
    }
    if (_AMT.mode === "example2") {
      return data.filter(function (item) {
        return item.role === prefix + "di" || item.role === prefix + "b";
      });
    }
    if (_AMT.mode === "example3") {
      return data.filter(function (item) {
        return item.role === prefix + "f";
      });
    }
    if (_AMT.mode === "example4") {
      return data.filter(function (item) {
        return item.role === prefix + "fi";
      });
    }
    if (_AMT.mode === "example5") {
      return data.filter(function (item) {
        return item.role === prefix + "d" || item.role === prefix + "a";
      });
    }
    if (_AMT.mode === "example6") {
      return data.filter(function (item) {
        return item.role === prefix + "f";
      });
    }
    return data;
  };

  // --------------------------------------------------------
  // Public API (unchanged from original)
  // --------------------------------------------------------

  this.load = function (callback) {
    loadGraph(function (graph) {
      GRAPH.edited = copy(graph);
      GRAPH.original = copy(graph);
      callback();
    });
  };

  var copy = function (graph) {
    var cpy = { nodes: [], edges: [] };
    for (var i in graph.nodes) {
      cpy.nodes.push({
        id: graph.nodes[i].id,
        label: graph.nodes[i].label,
        concept: graph.nodes[i].concept,
      });
    }
    for (var i in graph.edges) {
      var width;
      if (graph.edges[i].width > 1.0) {
        width = 1.0;
      } else {
        width = parseFloat(graph.edges[i].width);
        if (_AMT.mode === "example5" || _AMT.mode === "example6") {
          width = width.toFixed(3);
        } else {
          width = width.toFixed(2);
        }
      }
      cpy.edges.push({
        role: graph.edges[i].role,
        from: graph.edges[i].from,
        to: graph.edges[i].to,
        width: graph.edges[i].width,
        label: width,
        font: {
          align: "middle",
          size: 16,
          color: "blue",
          face: "monospace",
        },
      });
    }
    return cpy;
  };

  var search = function (edges, role, from, to) {
    for (var i in edges) {
      if (edges[i].role == role && edges[i].from == from && edges[i].to == to) {
        return i;
      }
    }
    return -1;
  };

  var updateReasoning = function (edges, role, from, to, width) {
    var k = search(edges, role, from, to);
    if (k >= 0 && edges[k].width < width) {
      edges[k].width = width;
      return true;
    }
    if (k < 0 && width > 0) {
      if (width > 1.0) width = 1.0;
      else {
        width = parseFloat(width);
        width = width.toFixed(2);
      }
      edges.push({
        role: role,
        from: from,
        to: to,
        width: width,
        label: role.replace(_AMT.prefix, "") + ":" + width,
        font: { align: "middle", size: 16, color: "red", face: "monospace" },
      });
      return true;
    }
    return false;
  };

  var conjunction = function (x, y, logic) {
    if (logic == PREFIX + "LukasiewiczLogic") return Math.max(x + y - 1, 0);
    if (logic == PREFIX + "ProductLogic") return x * y;
    if (logic == PREFIX + "GoedelLogic") return Math.min(x, y);
    return 0;
  };

  var doReasoning = function (graph) {
    var change = true;
    while (change) {
      change = false;
      for (var i in AXIOMS) {
        var a = AXIOMS[i];

        if (a.type == "RoleChainAxiom") {
          for (var j1 in graph.edges) {
            for (var j2 in graph.edges) {
              if (
                graph.edges[j1].to == graph.edges[j2].from &&
                graph.edges[j1].role == a.antecedent1 &&
                graph.edges[j2].role == a.antecedent2
              ) {
                var c = conjunction(
                  graph.edges[j1].width,
                  graph.edges[j2].width,
                  a.logic,
                );
                if (
                  updateReasoning(
                    graph.edges,
                    a.consequent,
                    graph.edges[j1].from,
                    graph.edges[j2].to,
                    c,
                  )
                )
                  change = true;
              }
            }
          }
        }

        if (a.type == "InverseAxiom") {
          for (var j in graph.edges) {
            if (graph.edges[j].role == a.antecedent) {
              var c = graph.edges[j].width;
              if (
                updateReasoning(
                  graph.edges,
                  a.inverse,
                  graph.edges[j].to,
                  graph.edges[j].from,
                  c,
                )
              )
                change = true;
            }
          }
        }
      }
    }
    return graph;
  };

  var consistent = function () {
    var graph = doReasoning(copy(GRAPH.edited));
    for (var i in AXIOMS) {
      var a = AXIOMS[i];
      if (a.type == "DisjointAxiom") {
        for (var j in graph.edges) {
          if (
            graph.edges[j].role == a.role1 &&
            search(
              graph.edges,
              a.role2,
              graph.edges[j].from,
              graph.edges[j].to,
            ) >= 0
          ) {
            console.info("!consistent -> DisjointAxiom");
            return false;
          }
        }
      }
      if (a.type == "SelfDisjointAxiom") {
        for (var k in graph.edges) {
          if (
            graph.edges[k].role == a.role &&
            graph.edges[k].from == graph.edges[k].to
          ) {
            console.info("!consistent -> SelfDisjointAxiom");
            return false;
          }
        }
      }
    }
    return true;
  };

  this.addIndividual = function (label, concept) {
    var id = PREFIX_INSTANCES + StrID();
    GRAPH.edited.nodes.push({ id: id, label: label, concept: concept });
    return id;
  };
  this.addExistingIndividual = function (id, label, concept) {
    GRAPH.edited.nodes.push({ id: id, label: label, concept: concept });
    return id;
  };
  this.removeIndividual = function (id) {
    var change = true;
    while (change) {
      change = false;
      for (var i in GRAPH.edited.edges) {
        if (
          GRAPH.edited.edges[i].from == id ||
          GRAPH.edited.edges[i].to == id
        ) {
          GRAPH.edited.edges.splice(i, 1);
          change = true;
          break;
        }
      }
    }
    for (var i in GRAPH.edited.nodes) {
      if (GRAPH.edited.nodes[i].id == id) {
        GRAPH.edited.nodes.splice(i, 1);
        break;
      }
    }
    return consistent();
  };
  this.editAssertion = function (role, from, to, width) {
    var index = search(GRAPH.edited.edges, role, from, to);
    if (index >= 0) {
      if (width > 0) GRAPH.edited.edges[index].width = width;
      else GRAPH.edited.edges.splice(index, 1);
    } else {
      if (width > 0) {
        if (width > 1.0) width = 1.0;
        else {
          width = parseFloat(width);
          width = width.toFixed(2);
        }
        GRAPH.edited.edges.push({
          role: role,
          from: from,
          to: to,
          width: width,
          label: width,
          font: { align: "middle", size: 10, color: "black", face: "arial" },
        });
      }
    }
    return consistent();
  };
  this.addExistingAssertion = function (id, role, from, to, width) {
    GRAPH.edited.edges.push({ role: role, from: from, to: to, width: width });
    return consistent();
  };
  this.cancel = function () {
    GRAPH.edited = copy(GRAPH.original);
  };
  this.getConcepts = function () {
    return CONCEPTS;
  };
  this.getRoles = function () {
    return ROLES;
  };
  this.getGraph = function (reasoning, edited) {
    if (edited) {
      return reasoning ? doReasoning(copy(GRAPH.edited)) : copy(GRAPH.edited);
    } else {
      return reasoning
        ? doReasoning(copy(GRAPH.original))
        : copy(GRAPH.original);
    }
  };
};
