// AMT Cypher export – single transaction
// Generated: 2026-03-18T23:01:49.261Z
// Nodes: 8  |  Edges: 12  (inferred: 5)

// Step 1: create / match all nodes
MERGE (Feature_Red:Feature {id: "Feature_Red"})
  ON CREATE SET Feature_Red.label   = "Feature Red",
                 Feature_Red.concept = "Feature"
MERGE (Feature_Blue:Feature {id: "Feature_Blue"})
  ON CREATE SET Feature_Blue.label   = "Feature Blue",
                 Feature_Blue.concept = "Feature"
MERGE (Feature_Green:Feature {id: "Feature_Green"})
  ON CREATE SET Feature_Green.label   = "Feature Green",
                 Feature_Green.concept = "Feature"
MERGE (Potter_A:Potter {id: "Potter_A"})
  ON CREATE SET Potter_A.label   = "Potter A",
                 Potter_A.concept = "Potter"
MERGE (Potter_B:Potter {id: "Potter_B"})
  ON CREATE SET Potter_B.label   = "Potter B",
                 Potter_B.concept = "Potter"
MERGE (Sherd_X:Sherd {id: "Sherd_X"})
  ON CREATE SET Sherd_X.label   = "Sherd X",
                 Sherd_X.concept = "Sherd"
MERGE (Sherd_Z:Sherd {id: "Sherd_Z"})
  ON CREATE SET Sherd_Z.label   = "Sherd Z",
                 Sherd_Z.concept = "Sherd"
MERGE (FindContext_I:FindContext {id: "FindContext_I"})
  ON CREATE SET FindContext_I.label   = "Find Context I",
                 FindContext_I.concept = "FindContext"
WITH Feature_Red, Feature_Blue, Feature_Green, Potter_A, Potter_B, Sherd_X, Sherd_Z, FindContext_I

// Step 2: create / match all relationships
// original assertions
MERGE (Feature_Red)-[:FEATUREATTRIBUTIONDEGREE {weight: 0.5, role: "FeatureAttributionDegree", inferred: false}]->(Potter_A)
MERGE (Potter_A)-[:POTTERATTRIBUTIONDEGREE {weight: 0.6, role: "PotterAttributionDegree", inferred: false}]->(Sherd_X)
MERGE (Sherd_X)-[:WEIGHTEDDATINGDEGREE {weight: 0.51, role: "WeightedDatingDegree", inferred: false}]->(FindContext_I)
MERGE (Feature_Blue)-[:FEATUREATTRIBUTIONDEGREE {weight: 1, role: "FeatureAttributionDegree", inferred: false}]->(Potter_B)
MERGE (Feature_Green)-[:FEATUREATTRIBUTIONDEGREE {weight: 0.33, role: "FeatureAttributionDegree", inferred: false}]->(Potter_B)
MERGE (Potter_B)-[:POTTERATTRIBUTIONDEGREE {weight: 0.83, role: "PotterAttributionDegree", inferred: false}]->(Sherd_Z)
MERGE (Sherd_Z)-[:WEIGHTEDDATINGDEGREE {weight: 0.6, role: "WeightedDatingDegree", inferred: false}]->(FindContext_I)

// inferred assertions (reasoning)
MERGE (Feature_Red)-[:FIGURETYPEREPERTOIRECHOICE {weight: 0.3, role: "FigureTypeRepertoireChoice", inferred: true}]->(Sherd_X)
MERGE (Feature_Blue)-[:FIGURETYPEREPERTOIRECHOICE {weight: 0.83, role: "FigureTypeRepertoireChoice", inferred: true}]->(Sherd_Z)
MERGE (Feature_Green)-[:FIGURETYPEREPERTOIRECHOICE {weight: 0.2739, role: "FigureTypeRepertoireChoice", inferred: true}]->(Sherd_Z)
MERGE (Potter_A)-[:DATINGWEIGHT {weight: 0.31, role: "DatingWeight", inferred: true}]->(FindContext_I)
MERGE (Potter_B)-[:DATINGWEIGHT {weight: 0.5, role: "DatingWeight", inferred: true}]->(FindContext_I)

RETURN *