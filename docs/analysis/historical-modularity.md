# Historical Notes on Modularity: Flat versus Hierarchical

**Status:** Background analysis - informs the "Why hierarchical modularity"
page and the argument the model documents make; not normative.

**Date:** 2026-09-02

**Question:** In computer science and software engineering at large - not in
JavaScript or TypeScript specifically - is there a real debate between flat
and hierarchical modularity, how strong is it, and why do most languages not
implement a hierarchical module system?

**Second question (Part II, sections 8 to 13):** In object-oriented and
mixed-paradigm languages, where do encapsulation and namespacing live, do
they ever coincide in one unit, which hierarchy carries visibility when one
does, and what did the designers say about modules above the class?

**Evidence grades.** Claims are marked **[E]** when taken from a primary source
that was fetched or extracted, **[S]** when taken from search-result summaries
only, **[M]** when recalled from a source that could not be fetched, and
**[I]** when they are inference from the rest.

## Part I. Flat versus hierarchical modularity

### Summary (Part I)

There is no debate called "flat versus hierarchical modules". That modules
form a containment tree is close to universal, from Structured Design through
Parnas's A-7E module guide to every monorepo's directory and ownership
structure. Most languages do have hierarchical *names*; what they lack is
hierarchical *visibility*, and the reasons are historical and economic rather
than a judgement that trees are wrong.

The pattern across languages is one-directional. Every flat system that grew
large later bolted on an ancestor-scoped visibility rule - Go's `internal`,
Swift's `package`, Java's qualified exports, dune's wrapping, Elixir's
`boundary` library - while no ancestor-scoped system (Rust, Ada, Scala) has
moved toward flatness.

What is genuinely contested is narrower, and sits in three places:

1. **Can one tree carry every concern?** Settled no in principle (Tarr,
   Kiczales, Alexander), but the proposed remedies faded; mainstream practice
   is one primary tree plus escape hatches.
2. **How strict should parent-governed visibility be?** Languages split
   between ancestor-scoped auto-visibility, parent-mediated re-export, and
   flat access lists. A rule with no sibling channel is the strict end of
   that spectrum.
3. **Is the visibility tree also the dependency hierarchy?** All the
   empirical support for "hierarchy" measures dependency layering and
   acyclicity, not containment nesting.

### 1. Is there a named debate? The classic positions

- **Parnas 1972, "On the Criteria To Be Used in Decomposing Systems into
  Modules"** [E for the key sentence; M for the surrounding argument].
  Concludes that "hierarchical structure and 'clean' decomposition are two
  desirable but independent properties of a system structure." The hierarchy
  he means is Dijkstra's partial order - "uses" or "depends upon" - whose
  benefits are that upper levels are simplified by using lower ones and that
  upper levels can be pruned to leave a usable product. He does not argue for
  a containment tree of modules.
- **Parnas 1974, "On a 'Buzzword': Hierarchical Structure"** [S abstract; M
  content]. The term "has a number of quite different meanings"; one can find
  two different senses of "hierarchy" in a single operating system. He
  enumerates distinct relations - uses, calls, part-of, resource ownership,
  protection - and says "hierarchical" is meaningless until the relation is
  named. This is the cleanest primary-source warning that containment trees
  and dependency layering are different things.
- **Parnas 1979, "Designing Software for Ease of Extension and
  Contraction"** [E]. "A uses B if correct execution of B may be necessary for
  A to complete the task described in its specification"; "in our approach
  there is no correspondence between modules and levels"; a uses-hierarchy
  means "each level offers a testable and usable subset."
- **Parnas, Clements and Weiss 1985, the A-7E module guide** [E abstract].
  Information hiding "can be supplemented by a hierarchically structured
  document ... to identify easily the parts they must understand, without
  reading irrelevant details." This is a containment tree of
  information-hiding modules (hardware-hiding, behavior-hiding,
  software-decision, each subdivided) [S]. It is the strongest classic source
  *for* nesting modules into a tree, and its stated purpose is navigation and
  change localization, not visibility.
- **Dijkstra 1968, the THE multiprogramming system** [E, EWD196]. Levels 0
  to 5; "starting at level 0 the system has been tested, each time adding (a
  portion of) the next level only after the previous level has been
  thoroughly tested"; without it "the number of 'relevant states' would have
  exploded"; "the larger the project, the more essential the structuring!" A
  layering hierarchy, not containment.
- **Structured Design (Stevens, Myers and Constantine 1974)** [S; E for the
  structure-chart notation]. Structure charts are trees of modules by
  invocation; coupling, cohesion and "span of control" heuristics were born
  there. Tree-shaped by construction.
- **Simon 1962, "The Architecture of Complexity"** [E]. "By a hierarchic
  system, or hierarchy, I mean a system that is composed of interrelated
  subsystems, each of the latter being, in turn, hierarchic in structure",
  explicitly excluding the authority sense. Near-decomposability, the Hora
  and Tempus watchmakers, and the observation that hierarchic structures
  "can often be described in economical terms" are the canonical pro-nesting
  arguments: stable intermediate forms, and describability.
- **Alexander 1965, "A City is not a Tree"** [E]. Tree axiom versus
  semilattice axiom; "the tree is accessible mentally and easy to deal with.
  The semilattice is hard to keep before the mind's eye"; "if we make cities
  which are trees, they will cut our life within to pieces." A 2023 paper in
  *The Art, Science, and Engineering of Programming* [E] confirms the essay
  repudiates Alexander's own tree-decomposition method from *Notes on the
  Synthesis of Form*. No widely cited software text was found that deploys
  Alexander specifically against module trees; his influence in software
  runs through design patterns.
- **Tarr, Ossher, Harrison and Sutton 1999, "N Degrees of Separation"** [E
  abstract]. "The predominant methodologies and formalisms available ...
  support only orthogonal separations of concerns, along single dimensions of
  decomposition." Coined "the tyranny of the dominant decomposition" [S].
- **Kiczales et al. 1997, aspect-oriented programming** [E]. "Neither
  procedural nor object-oriented programming techniques are sufficient to
  clearly capture some of the important design decisions"; "aspects and
  components cross-cut each other." This targets any single decomposition,
  tree or flat.
- **What became of AOP and multi-dimensional separation** [S]. Steimann
  2006, "The paradoxical success of aspect-oriented programming"; an
  Empirical Software Engineering study in 2018 finds "little convincing
  empirical evidence" that AspectJ reduces maintenance effort; IEEE Computer
  2024, "The Forgotten Potential: Why AOP Faded Away". The cross-cutting
  diagnosis survived; the remedy did not go mainstream.
- **Ousterhout 2018, A Philosophy of Software Design** [S; E for notes].
  Deep modules, "different layer, different abstraction", pass-through
  methods that "contribute no new functionality." About interface depth and
  layering; takes no position on containment trees.
- **Brooks** [S]. "Parnas was right, and I was wrong" about information
  hiding. Nothing on trees.
- **"Hierarchies considered harmful"**: no software-specific position found;
  the hits are file-management and tagging essays.

**[I]** The field's classic debate is not tree-versus-flat. It is (a) which
relation is hierarchical (Parnas 1974), (b) whether one decomposition can
carry every concern (Tarr, Kiczales, Alexander), and (c) how strict layering
should be (Dijkstra and Parnas versus the "relaxed layering" of the POSA
books [M]). A containment tree of modules is largely taken for granted.

### 2. Why most languages have hierarchical names but flat visibility

- **The module was born as the compilation unit.** In Mesa, Modula-2, C and
  Java the unit above the function is what the compiler and linker handle,
  and separate compilation wants a flat set of those. Wirth had nested "local
  modules" in Modula-2 and dropped them from Oberon: "global modules appear as
  the parts of a large system that are typically implemented by different
  people or teams" [E, Wirth, HOPL-III]. The ISO Modula-2 revision proposal
  makes the same argument outright: "if there is sufficient reason to
  delegate certain responsibilities ... to a local module, then there is also
  sufficient reason to delegate those responsibilities to a separate library
  module" [S].
- **Object orientation moved information hiding to the class.** Once public
  and private lived on types, the module became a namespace for organizing
  names, and package-level encapsulation looked redundant. The Java Language
  Specification says so directly: the hierarchical naming of packages "has no
  significance in itself", and "code in a package named oliver.twist has no
  better access to the classes ... declared within package oliver than code
  in any other package" [E, JLS 7.1]. C# and Kotlin inherited the stance.
- **A tree in the source becomes part of the interface.** Swift considered
  submodules and rejected them: "submodule structure would be part of the
  source language, so it would naturally be source- and ABI-affecting" [E,
  SE-0386]. If the hierarchy is in the code, moving a module changes every
  import path and, for compiled libraries, the binary interface. Languages
  that care about stable interfaces push organization out to the build
  system.
- **Build systems and package managers took the job.** The largest codebases
  enforce boundaries in the build graph (Bazel and Buck visibility, section
  4), so the language never had to. The ecosystem's package registry - npm,
  Maven, PyPI - is flat by nature, so the unit above the file became the
  package, and packages are flat.
- **Designers know one tree cannot carry every concern.** A flat set with
  explicit dependency declarations is the more general mechanism. Language
  designers prefer the general primitive and leave policy to tooling, which
  is what Bazel's package groups and Nx's tags are.
- **Hierarchical visibility has real ergonomic costs.** Rust's 2017 module
  discussion was about re-export chains, an "apparent" module hierarchy that
  "often tells you very little about the actual module hierarchy", and the
  rule that "a module's private items are always visible to its submodules,
  but private items within its submodules aren't visible to each other" [E,
  Turon 2017; RFC 2126]. A designer weighing a third visibility concept
  against that learning curve often declines.

The languages that do have hierarchical visibility come from a different
lineage: the ML family, where the module is the unit of abstraction; Ada,
designed for large systems with subsystem decomposition as a goal; and Rust,
which needed crate-internal privacy without classes.

**[I]** TypeScript sits at the far end of all of this. It inherited
JavaScript's file-as-module, npm's flat packages, and classes as the only
encapsulation, so it has no unit between the file and the package at all.
The reasons above are also why the language itself is unlikely to add one.

### 3. How languages and module systems chose

Classification: **flat** - the visibility unit has no parent/child relation;
**ancestor-scoped** - an item can be made visible to an enclosing scope and
hence that scope's whole subtree, with no re-export; **parent-mediated** -
the enclosing module's interface decides what leaks out.

| System | Model | Evidence | Community verdict |
| --- | --- | --- | --- |
| **Rust** | ancestor-scoped, parent-mediated for export | "If an item is private, it may be accessed by the current module and its descendants"; `pub(in path)` "must be a simple path which resolves to an ancestor module"; "anything which is usable externally must be pub from the root down to the destination item"; "these two cases are surprisingly powerful" [E, reference]. | The 2017 discussion was about ergonomics, not the principle; RFC 2126 kept the tree: "there's a beautiful uniformity and sparseness in these rules that makes them appealing" [E]. Regarded as a strength; the pain is re-export chains and the `pub` versus `pub(crate)` ambiguity [I]. |
| **OCaml / Standard ML** | parent-mediated (signature ascription), build-level nesting | "A signature specifies which components of a structure are accessible from the outside ... It can be used to hide some components" [E, manual]. Dune wraps libraries by default and has `private_modules` [E]. SML/NJ's compilation manager describes "hierarchical modularity" with explicit export interfaces [E abstract]. | The 2013 OCaml namespace debate objected that nested namespaces make "getting the exposed interface right" hard [E]; the outcome was one level of build-managed wrapping, not language-level hierarchical namespaces. |
| **Ada 95** | ancestor-scoped tree | Child units yield "a tree-like hierarchical structure, beginning at a root library unit"; a child's private part sees the parent's private part; private children are "never visible outside of the parent"; "public children enable the decomposition of the view of a subsystem ... private children enable the decomposition of the implementation" [E, Rationale ch. 10]. | Mature and uncontroversial in that community [I]. |
| **Modula-2 / Oberon** | nested local modules in Modula-2; flat in Oberon | See section 2 [E, Wirth]. | The Wirth line abandoned nesting for simplicity and team mapping. The clearest language-designer argument against nested modules. |
| **Java** | flat | See section 2 [E, JLS 7.1]. JPMS modules form a flat set with a readability graph and qualified `exports ... to` [E]. | Felt as a pain: with everything public, "packages are simply an organisation mechanism (a grouping, like folders) rather than being used for encapsulation" [E, Simon Brown]; enforcement needs ArchUnit or JPMS. The package-by-layer versus package-by-feature debate is about which tree, never whether [S]. |
| **C# / .NET** | flat (assembly) | `InternalsVisibleTo` "opens up your entire space of internal types to all these assemblies"; the proposed namespace accessibility is explicitly "not including sub-namespaces" [E, csharplang #6794]. | Felt as a gap; the fix under discussion is still flat. |
| **Kotlin** | flat | `internal` is "visible within the same module"; no package-hierarchy visibility [E]. | Accepted. |
| **Swift** | flat, plus one new level | "Swift does not recognize organizations of code above the module level"; submodules rejected as source- and ABI-affecting [E, SE-0386]. | The community wanted a third scope and deliberately chose a flat extra level over a tree. An important counter-datapoint. |
| **Go** | flat packages plus ancestor-scoped `internal` | A package under `.../a/b/c/internal/...` "can be imported only by code in the directory tree rooted at .../a/b/c" [E, Go 1.4]; "there are only two forms of access: local (unexported) and global (exported)"; "keep packages in internal as much as possible" [E]. | `internal` is regarded as a strength; nesting depth is culturally discouraged - Russ Cox on the golang-standards layout: "just very complex, and Go repos tend to be much simpler" [E]. |
| **Haskell** | hierarchical names, flat visibility | "This is purely a convention ... a modid is treated as a single identifier occupying a flat namespace" [E, Report 5]. | The `.Internal` module convention is a workaround [E]; proposals are Cabal sublibraries, not hierarchy. |
| **Elixir / Erlang** | flat (names are atoms) | Namespacing "is a convention rather than something built into the language" [S]. | The popular `boundary` library re-creates the parent-mediated tree: boundaries nest, "the modules from the parent boundary are implicitly allowed to use the exports of the child sub-boundaries", and "the parent boundary may export modules that are exported by its sub-boundaries" [E]. |
| **Python** | flat, unenforced | Leading-underscore convention; "an interface is also considered internal if any containing namespace ... is considered internal" [E, PEP 8]. | Culturally "flat is better than nested" [M, PEP 20]. |
| **Scala** | ancestor-scoped | `private[C]` where "C must denote a class or package enclosing the definition" [E, spec ch. 5]. | Uncontroversial; rarely cited in this debate [I]. |

**[I]** The complaints against tree systems are about re-export ergonomics and
hierarchy-as-interface, never about the principle. The complaints against
flat systems are about the missing scope, and are answered by adding one
ancestor-scoped rule.

### 4. Build and monorepo tooling: where boundaries are decided today

- **Bazel** [E]. Default visibility is private to the package; grants are
  `__pkg__`, `__subpackages__` ("//foo/bar and all of its direct and indirect
  subpackages") and `package_group`; the documentation says to avoid public
  default visibility and to "prefer `__subpackages__` over `__pkg__`". The
  primitive is a grant from a target to arbitrary locations - a graph access
  list - with subtree patterns as sugar.
- **Google practice** [E, *Software Engineering at Google*, ch. 18]. "Each
  team's internal implementation targets will be restricted to only
  directories owned by the team, and most BUILD files will have only one
  target that isn't private"; targets are public only when they "represent
  widely used libraries", otherwise teams "maintain a whitelist of customer
  targets". Ownership is tree-inherited: Chromium's OWNERS files "are
  recursive, so each file also applies to its subdirectories", and opting out
  "should be rarely used" [E].
- **Buck2** [E]. Unset visibility means only targets in the same build file
  may depend on the target; recursive `//foo/...` patterns; `PUBLIC`; plus
  `within_view`, a constraint on what a target may depend on.
- **Pants** [E]. Dependency and dependent rules with subtree globs; the stated
  motivation includes "an application may not be allowed to depend on code
  from a sibling application."
- **Nx** [E]. Purely tag-based constraints: "folder/directory structure plays
  no role"; no parent/child notion. The flat, multi-dimensional model in
  practice.
- **Gradle / Maven** [E; M for Maven]. Any project may depend on any other;
  Gradle's `api` versus `implementation` controls transitive leakage to
  consumers, not location; a Maven parent POM is configuration inheritance
  only.

**[I]** In the largest codebases the primitive is an explicit dependency
access list, but the practice is directory-subtree-scoped: team directories,
subpackages, inherited ownership. That is hierarchical-by-ownership with
explicit cross-tree grants. Nobody at that scale relies on language-level
module nesting for cross-team boundaries; they rely on the build graph.

### 5. The strongest arguments, stated fairly

**Against trees, or against a single tree**

1. **Dominant decomposition** [E, Tarr; Kiczales]. Concerns that cross-cut
   the tree - logging, authorization, serialization, shared types - get
   scattered and tangled; a tree fixes one axis forever.
2. **Semilattice and overlap** [E, Alexander]. The tree is chosen because it
   is "accessible mentally", not because the system is one; overlap is real,
   and trees "cut ... to pieces". Alexander's own tree method was repudiated
   by its inventor.
3. **Teams are not a tree** [E, Conway]. If the module tree is also the
   visibility tree, it must match ownership or the two fight. Google forces
   the coincidence by directory ownership.
4. **Ancestor routing cost** [E, Turon; SE-0386]. Sharing between cousins
   requires touching every ancestor up to the common one; re-exports make the
   apparent hierarchy lie; a hierarchy encoded in source is expensive to
   reshape. Root-level `common/`, `shared/` and `utils/` directories are the
   observable symptom [I].
5. **Simplicity** [E, Wirth; Russ Cox]. A nested module adds a concept whose
   work a separate top-level module could do; large-system parts map to
   teams, nested parts do not.
6. **Expressiveness** [E, Nx; Bazel package groups]. Tags and groups can
   state "any UI library may use any utility library regardless of location";
   a pure tree cannot.

**For trees**

1. **Near-decomposability and describability** [E, Simon]. Nested subsystems
   evolve faster through stable intermediate forms and can be described
   economically; the deepest theoretical grounding for zooming in and out.
2. **Verification and testable subsets** [E, Dijkstra; Parnas 1979].
   Level-by-level testing; "each level offers a testable and usable subset."
3. **Navigation and change localization** [E, Parnas 1985]. A hierarchical
   module guide lets maintainers "identify easily the parts they must
   understand."
4. **Composable privacy from two rules** [E, Rust reference]. "Surprisingly
   powerful"; the unbroken `pub` chain from the root means a parent can
   always veto exposure.
5. **Decomposing both interface and implementation** [E, Ada]. Public
   children decompose the view, private children the implementation,
   invisible outside the subtree.
6. **Ownership and practice at scale** [E, Google; Chromium]. Restriction to
   team-owned directories and recursive ownership are how the largest
   codebases actually operate.
7. **Hierarchical component models** [S, Fractal, Koala, Darwin]. Composite
   components hide subcomponents behind bound interfaces; standard in
   component-based and systems engineering.
8. **Revealed preference** [I]. Flat systems keep adding ancestor scopes,
   which suggests two-level visibility is insufficient in practice.

### 6. Empirical and quasi-empirical evidence

- **Baldwin, MacCormack and Rusnak 2014, "Hidden Structure"** [E abstract].
  1,286 releases of 17 applications classified as core-periphery, multi-core
  or hierarchical; most releases are core-periphery with a large cyclic core;
  "open, distributed organizations develop systems with smaller Cores." Here
  "hierarchical" means few dependency cycles, not containment.
- **Sturtevant 2013** [E abstract]. Architectural complexity, defined as
  "lack or breakdown of hierarchy or modularity" in the dependency graph, is
  associated with "50% drops in productivity", "three-fold increases in defect
  density" and "order-of-magnitude increases in staff turnover". One firm,
  eight versions.
- **MacCormack, Rusnak and Baldwin 2006** [E abstract]. Design structure
  matrices and propagation cost; Mozilla's deliberate redesign produced an
  architecture "significantly more modular than its predecessor and Linux";
  "intentional managerial actions can substantially impact" structure.
- **Sarkar, Rama and Kak 2007** [S]. Layer Organization Index and Cyclic
  Dependency Index, premised on strict layering. Metric validation, not
  outcome measurement.
- **Cai et al., design rule hierarchy and design rule spaces** [S]. Layers
  of design rules used for hotspot and bug-proneness analysis. Layering
  again.
- **Bouwers, van Deursen and Visser, component balance** [S]. The number and
  size balance of top-level components correlates with expert analyzability
  ratings. About how the top level is cut, not depth.
- **Valverde and Solé, "Hierarchical Small Worlds"** [S]. Class-dependency
  graphs are small-world and hierarchically modular. Descriptive, not
  normative.
- **AOP evolvability** [S, EMSE 2018]. Little convincing evidence that
  aspects reduce maintenance effort.
- **The mirroring hypothesis** [S, MacCormack et al. 2012]. Product
  architecture mirrors organization, supporting Conway.

**Gap [E/I].** No study was found that isolates containment nesting with
parent-governed visibility as a variable and measures maintainability. Every
quantitative result above concerns the dependency hierarchy - acyclicity,
core size, propagation cost. A page that cites this literature as evidence
for a containment tree is making an inference the studies do not make, unless
the tree also constrains dependency direction.

### 7. Consequences for ramify's argument

Where ramify's model sits: it is a containment tree with parent-governed
visibility, at the strict end of the spectrum in section 3 - a symbol reaches
a sibling only if the parent exposes it to its descendants, where Rust and Go
let siblings see anything the parent's scope can see without re-export. That
strictness, and the single-tree question, are what a reader will contest.
Nesting itself will not be attacked.

Objections the argument must answer, ranked by how often they come up and how
strong they are:

1. **Cross-cutting concerns and the dominant decomposition** (most frequent,
   strong). Where do shared vocabulary, types and infrastructure live, and
   does the answer degenerate into a root-level `common/`? The global-library
   example is the answer and should be presented as one.
2. **Ancestor routing and re-export churn** (frequent, strong, backed by
   Rust's experience and Swift's rejection of submodules). The cost of lifting
   a symbol through several ancestors, the apparent-versus-actual hierarchy
   problem, and the cost of reshaping a tree once code encodes it. Rust says
   the ergonomics bite, not the principle; the argument should say what keeps
   the chain cheap and visible.
3. **Which hierarchy?** (rarer in blogs, strongest in the literature). State
   that this is a containment tree with parent-governed visibility, and what
   rule governs the dependency graph across branches. Parnas 1974 is the
   citation that will be thrown at any text that says "hierarchical" without
   naming the relation.
4. **Conway and ownership mismatch** (frequent). The tree must coincide with
   team boundaries or be overridable.
5. **Flatness as a cultural default** (frequent in Go, Python and Oberon
   circles; moderate). The Wirth and Cox argument that a nested module could
   just be a top-level module. Answered by abstraction levels, but the
   objection deserves naming.
6. **Expressiveness of tags and groups** (moderate). A tree cannot state
   location-independent policy. ramify's tags are a partial answer, and they
   only restrict.
7. **No direct empirical evidence** (rare, decisive if raised). Do not cite
   the maintainability literature as proof of nesting.
8. **Learnability** (moderate). "Descendants see my privates, but not each
   other's" confuses newcomers; the no-sibling rule needs a mental model,
   which the diagrams provide.

## Part II. Encapsulation and namespacing in object-oriented and mixed languages

**Question:** Every object-oriented or mixed-paradigm language has a way to
hide things and a way to group names. Where does each live, do the two ever
coincide in one unit, which hierarchy carries visibility when one does, and
what did the designers say about modules above the class? Same evidence
grades as Part I.

### Summary (Part II)

Mainstream OOP settled on encapsulation at the class and namespacing above
it, and wrote the separation into the specifications. The Java Language
Specification says the package hierarchy "has no significance in itself";
the C# standard says "Namespaces have no access restrictions"; for C++20
modules "Dots have no intrinsic meaning". The class had absorbed the module
(Meyer: "Classes should be the only modules"), so the level above the class
was left with names only.

Four regularities come out of the survey:

1. **Every encapsulation unit added above the class later is a build
   artifact, and flat.** The .NET assembly, the Kotlin and Swift module, the
   JPMS module, the C++20 named module, the Objective-C linked image, the npm
   package behind an `exports` map. None of them nests. Swift considered a
   submodule tree and rejected it.
2. **The file came back as an encapsulation unit.** Delphi's plain `private`
   is unit-wide; D and Dart have no class-private at all, only module- or
   library-private; Kotlin, Swift, C# 11 and Crystal each added a file-scoped
   level. That is the Wirth line - hide at the module, not at the type -
   winning anonymously, and it is TypeScript's own model.
3. **OOP spent its hierarchical visibility on the inheritance tree**, through
   `protected`, and the literature turned against it (Snyder 1986, the Gang
   of Four, Bloch). The replacements are flat: `final` by default, `open` at
   the module boundary, a `permits` list. Lexical containment carries
   visibility only inside one compilation unit, and Java flattens even that
   into a "nest". The package tree carries visibility almost nowhere: Scala's
   `private[C]`, D's `package(a.b)` and VisualWorks Smalltalk are the
   exceptions inside OOP, with Ada and Rust outside it.
4. **When a language needed "these units may see this", it reached for a
   list, never a region.** Eiffel's `feature {A, B}`, C++ `friend`, .NET
   `InternalsVisibleTo`, Java `exports ... to` and `permits`, Swift
   `@testable`. The Bazel pattern of section 4, at language level.

**[I]** For ramify this confirms Part I from a second direction. TypeScript
is not an outlier; it is the mainstream settlement without the
class-as-module doctrine: class privacy (soft, or hard with `#`), file
privacy through `export`, a flat package boundary through `exports`, and
nothing between the file and the package. A group of files behind an
interface is the Modula unit lifted one level; a tree of such groups with
parent-governed visibility is the rule of D, Scala, Ada and Rust; and the
objection that this makes visibility a property of project layout rather
than of a text is the one Swift raised and the one the argument has to answer
(section 13).

### 8. The doctrine: the class as module, and its opponents

- **Meyer, Object-Oriented Software Construction, 2nd ed. (1997)** [E, full
  text from Meyer's site]. "Classes should be the only modules" (§2.2). "A
  class is a module, or unit of software decomposition; but it is also a type
  ... Much of the power of the object-oriented method derives from this
  identification" (§7.3). On modules above the class (§7.10): selective
  export "helps us understand a frequently debated issue: whether we need
  modules above the level of classes. Without selective exports, the only
  solution (other than renouncing Information Hiding altogether) would be to
  introduce a new modular structure to group classes. Such super-modules,
  similar to Ada's or Java's packages, would have their own rules for hiding
  and exporting. By adding a completely new and partly incompatible module
  level to the elegant framework defined by classes, they would yield a
  bigger, hard-to-learn language." Nested classes are rejected too: "this is
  the approach of Simula, which permits class nesting. It too brings its
  share of extra complexity, for no clear benefit." The reuse objection: "if
  a class belongs to a package or an enclosing class we will not be able to
  reuse it by itself". Clusters do nest, but "the cluster is a management and
  organizational notion; making it a language construct would jeopardize the
  simplicity of the object-oriented approach" (§7.10), and "classes as well
  as features have a flat structure, since nesting at either of those levels
  would cause unnecessary complication" (§3.2). ECMA-367 §8.3 is normative on
  the point: "only class, describing the basic building blocks, corresponds
  directly to a construct of the language. To build clusters and systems out
  of classes, you will use not a language mechanism, but tools of the
  supporting environment" [E]. The standard defines the cluster as a
  recursive containment tree and attaches no visibility rule to it anywhere
  [E].
- **Wirth, "Modula-2 and Oberon" (HOPL-III)** [E]. "In object-oriented
  languages the concept of data type is merged with the module concept and is
  called a class. The fact remains that the two notions have different
  purposes, namely data structuring and information hiding, and they should
  not be confused." The module "merely constitutes a wall around the local
  objects, through which only those objects are visible that are explicitly
  specified in an export or an import list." Oberon and Oberon-2 hide only at
  the module: exported record fields "are called public fields; unmarked
  fields are called private fields", private meaning invisible outside the
  declaring module, and Oberon-2's type-bound procedures carry the same
  module-level export mark as any other declaration, with `-` for read-only
  export [E, both Reports]. There is no class-private because there is no
  class [I].
- **Modula-3** [E, language definition]. "A module is like a block, except
  for the visibility of names. An entity is visible in a block if it is
  declared in the block or in some enclosing block; an entity is visible in a
  module if it is declared in the module or in an interface that is imported
  or exported by the module." Objects with inheritance and overriding, and no
  per-class access modifiers: hiding is by interface membership, and opaque
  types are revealed per scope ("Different scopes can reveal different
  information about an opaque type"). Friendship is a second, private
  interface. Module and interface names "are called global names": flat.
- **Szyperski 1992, "Import is Not Inheritance - Why We Need Both: Modules
  and Classes"** [S for the argument; E for one sentence as quoted by Bracha
  et al. 2010]. Class-only languages (Smalltalk, Eiffel, Sather) need modules
  besides classes, because "unifying modules and classes carries the danger
  of unifying the import and inheritance relationships" [S]; "To achieve the
  structuring power of modules, Smalltalk ... would need nested classes" [E,
  as quoted]. Full text not reachable.
- **Snyder 1986, "Encapsulation and Inheritance in Object-Oriented
  Programming Languages"** [E]. "In most languages, however, the introduction
  of inheritance severely compromises the benefits of this encapsulation." A
  class has two kinds of client, instantiators and heirs, and the interface
  to heirs "serves as a contract between the class and its children, and thus
  limits the degree to which the designer can safely make changes to the
  class". He describes the construct that became `protected` (from
  Trellis/Owl) and wants inheritance itself to be "a private decision of the
  designer". Nothing on packages or containment.
- **Simula** [E, Common Base Language 1970; SIMULA Standard 1986; Dahl 2001].
  The 1970 grammar has no protection part. The 1986 standard has `protected`
  (visible in the class, its subclasses and blocks prefixed by them) and
  `hidden`, which is subtractive and legal only on a protected attribute:
  "Only a protected attribute may be specified hidden." Dahl: the original
  class "was too permissive for the purpose of developing large systems.
  There was no means of enforcing a programming discipline protecting local
  class invariants"; Jacob Palme proposed the hiding mechanisms (1973 [E,
  Palme's bibliography]), approved as "the last addition ever to the
  language". Class-level encapsulation was a retrofit for large systems, not
  an original OO idea [I].
- **Smalltalk-80** [E, Ingalls 1981; Blue Book, OCR text; Pharo by Example].
  One rule: "all access to the internal state of an object is through this
  same message interface". Instance variables are private to the instance and
  all methods public; message categories are "intended to make the protocol
  more readable to the user; it does not affect the operation of the class";
  one global pool "named Smalltalk". Pharo today: protocols "have no
  semantics from the language view point"; "You may find that Pharo is
  lacking a namespace." VisualWorks 5i (shipped March 1999 [E, ObjectShare
  releases via the Wayback Machine]) added namespaces "as a language feature"
  with private shared variables that "cannot be imported" [E, Cincom
  Application Developer's Guide, read from a mirror].

**[I]** The two doctrines are exact negations. Meyer: the fusion of module
and type is where the power comes from, so nothing above the class may have
hiding rules of its own. Wirth: hiding and typing have different purposes, so
hiding belongs to the module and the type gets none. Mainstream OOP took
Meyer's class and then, one language at a time, rebuilt Wirth's module above
it under other names.

### 9. Where the specifications put each concept

- **Java** [E, JLS SE 21]. §7.1: the package naming hierarchy "has no
  significance in itself"; "there is no special access relationship between a
  package named `oliver` and another package named `oliver.twist`". §6.6.1:
  `private` access "occurs from within the body of the top level class or
  interface that encloses the declaration", so every nested type shares every
  private. JEP 181 calls that "complete (undifferentiated, flat) within the
  whole declaration of the containing top-level type", "a sort of
  'mini-package'", and disclaims "large scales of access control, such as
  modules" [E]. The package is the one place where namespace and
  encapsulation coincide: one level, flat. JPMS (2017) exports per package,
  the module-to-package name relationship "is not mandatory", and `exports
  ... to` names "friends" [E, State of the Module System; JLS §7.7.2].
- **C#** [E, C# standard; language reference]. Namespace nesting shortens
  names (a member's scope is "the namespace_body of every
  namespace_declaration whose fully qualified name is N or starts with N,
  followed by a period") and carries nothing else: "Namespaces have no access
  restrictions ... namespace names are always publicly accessible."
  Encapsulation above the type is the assembly (`internal`, 2002) and, since
  C# 11 (2022), the file. An assembly spans namespaces and a namespace spans
  assemblies [I]. `InternalsVisibleTo` names a friend assembly and grants the
  whole internal surface. VB.NET's `Friend` page states the purpose: elements
  "used by the entire assembly" that are "not ... accessible by code outside
  the assembly" [E].
- **C++** [E, working draft; Stroustrup HOPL-2 and HOPL-3]. A namespace is
  "a named scope"; the grammar has no access specifier; re-opening is
  normative; "A namespace is never attached to a named module and never has a
  name with module linkage." Stroustrup on the pre-1993 language: C++ "lacks
  an effective mechanism for expressing modularity above the level of the
  class and the file". His design intent: names in `XXX` "accessible from
  other scopes only when qualified by `XXX::` in exactly the same way static
  class members are accessed from outside their class". Sub-namespaces were
  rejected for the standard library because they "would have implied a
  standardization of parts of the library implementation". C++20 modules: a
  dotted module name is one name and "Dots have no intrinsic meaning" [E,
  cppreference mirror]; "The division of a module into module units is not
  visible outside the module." `friend` is "neither inherited nor
  transitive".
- **Kotlin** [E]. No package-private level at all. Top-level `private` is
  file-scoped, `internal` is module-scoped, and "an outer class does not see
  private members of its inner classes". No friend mechanism beyond the test
  source set seeing `main`'s internals.
- **Swift** [E, The Swift Programming Language; SE-0386]. The module is "the
  smallest unit of library structure ... and it makes sense for Swift to
  recognize that in both namespacing and access control". `private` reaches
  same-file extensions, `fileprivate` the file, `internal` the module,
  `package` (2023) the package. Submodules rejected: "Submodule APIs would
  still need to be able to declare whether they're usable outside of the
  umbrella or not, and that would require an access modifier"; "Submodule
  structure would be part of the source language, so it would naturally be
  source- and ABI-affecting."
- **Objective-C** [E, Apple]. No namespace construct; prefixes by
  convention. Access control on instance variables only; `@package` is
  "analogous to `private_extern`" and enforced by the linker. Method privacy
  is advisory: `performSelector:` bypasses it.
- **Scala** [E, Scala 2.13 specification §5.2; Programming in Scala; Odersky
  2010]. `private[C]` where C "must denote a class or package enclosing the
  definition"; accesses to a `private[outerpkg]` member "can appear anywhere
  within package `outerpkg`, including packages contained in it". Odersky:
  "The same technique is not possible in Java. There, once a definition
  escapes its immediate package boundary, it is visible to the world at
  large." The Scala 2.8 episode: relative, shadowing package nesting "caused
  confusion and consternation in users"; the fix "changes nothing in the way
  Scala packages nest", only what scope a qualified package clause opens.
  Naming was made absolute; visibility stayed on the tree.
- **Object Pascal, Delphi, Free Pascal** [E, Embarcadero docwiki via the
  Wayback Machine; FPC reference]. "A private member is invisible outside of
  the unit or program where its class is declared ... For a member to be
  visible only inside its class, it needs to be declared strict private."
  Co-location is the friend mechanism: "By placing related class declarations
  in the same module, you can give each class access to the private members
  of another class without making those members more widely accessible."
  `strict private` arrived in Delphi 2005 [S].
- **D** [E, dlang.org specification; changelog; D Blog 2018]. "Symbols with
  private visibility can only be accessed from within the same module."
  `package(a.b)`: "The package must be either the module's parent package or
  one of its ancestors. If this parameter is present, the symbol will be
  visible in the specified package and all of its descendants" (D 2.067.0,
  March 2015). Rationale: module privacy "is inspired by the C++ friend
  feature ... Being able to declare a 'friend' that is somewhere in some
  other file runs against notions of encapsulation"; the module "is a unit
  of encapsulation".
- **Dart** [E, specification §6.2; dart.dev]. "A declaration is private iff
  its name is private"; "private declarations may only be accessed within the
  library in which they are declared"; libraries "are a unit of privacy". No
  class-private. "Privacy is indicated by the name of a declaration - hence
  privacy and naming are not orthogonal." Packages are tooling; `lib/src` is
  a convention.
- **Ruby** [E]. Modules "serve two purposes in Ruby, namespacing and mix-in
  functionality"; nesting affects constant lookup only; method privacy is a
  property of the call form ("without a receiver"); `send` bypasses it, hence
  `public_send`; `private_constant` since 1.9.3.
- **Python** [E]. "'Private' instance variables that cannot be accessed
  except from inside an object don't exist in Python"; `__x` is name mangling
  "designed mostly to avoid accidents"; `__all__` is an export list for
  `import *`; PEP 8: "An interface is also considered internal if any
  containing namespace (package, module or class) is considered internal",
  the ancestor rule as a convention.
- **PHP** [E]. Namespaces (5.3, 2009) "contain the ability to specify a
  hierarchy of namespace names" and say nothing about access; visibility is
  class-level only; `@internal` is a docblock tag that "Static analysis tools
  MAY" act on.
- **Common Lisp** [E, HyperSpec]. "There is a single namespace for
  packages"; external symbols "are part of the package's public interface";
  "There is no way to inherit the internal symbols of another package", but
  `pkg::name` reaches them. CLOS slots have no access control [I].
- **Crystal, Nim, Julia** [E]. Crystal: "Private types can only be
  referenced inside the namespace where they are defined"; "A private
  top-level type is only visible in the current file." Nim: "Each module
  needs to be in its own file and has its own namespace"; `*` exports,
  including object fields. Julia: "unlike other languages, Julia has no
  facilities for truly hiding module internals."
- **TypeScript, JavaScript, npm** [E]. TypeScript's `private` is "soft
  private"; ES2022 `#` fields are "hard private" [E, handbook; TC39 FAQ]. The
  legacy `namespace` (TypeScript specification v1.8 §10.3): "the scope of a
  non-exported name declared within a namespace declaration is the body of
  that namespace declaration", so an inner namespace sees the outer's
  non-exported names while the outer needs `export` to see the inner's:
  lexical hierarchical visibility, compiled to closures, deprecated in favor
  of flat ES modules. Node's `exports` field (v12.7.0): "all subpaths of the
  package are encapsulated and no longer available to importers"; "This
  encapsulation of exports provides more reliable guarantees about package
  interfaces". `@internal` with `stripInternal` redacts declaration output
  only.

### 10. Survey table

Columns: the namespacing unit, whether it nests and whether nesting carries
visibility; the encapsulation units and their levels; the hierarchy, if any,
that carries visibility; explicit access lists; the unit added above the
class later, and its shape.

| System | Namespacing | Encapsulation units | Hierarchy carrying visibility | Access list; later unit above the class |
| --- | --- | --- | --- | --- |
| **Simula 67** | none | class: unmarked public; `protected`; `hidden` (subtractive, only on protected) [E] | inheritance; `hidden` may close it part-way down [E] | none; protection retrofitted in the 1970s [E] |
| **Smalltalk-80, Pharo** | none; one global `Smalltalk` pool [E] | the instance: variables private to the object, all methods public; categories are documentation [E] | inheritance of instance variables [M] | none; VisualWorks 5i (1999) namespaces with private bindings, dialect-local [E] |
| **Eiffel** | none in the language; clusters are tooling, absent from ECMA-367 [E] | class; per-feature client set (exported, selectively available, secret) [E] | inheritance on the client side: descendant-closed [E] | `feature {A, B}`, `feature {NONE}`; nothing above the class [E] |
| **C++** | namespace: nests, lookup only, "never attached to a named module" [E] | class; translation unit (unnamed namespace); C++20 named module (module linkage, private fragment) [E] | inheritance (`protected`); nested-class access "transitive and cumulative", enclosing class gets "no special access" [E] | `friend`; namespaces 1993/98 (no visibility); C++20 modules (flat) [E] |
| **Objective-C** | none; prefix convention [I] | instance variables only: `@private`, `@protected`, `@public`, `@package` (linked image) [E] | inheritance (`@protected` default) [E] | class extensions, file-scoped and advisory; `@package` (linker unit) [E] |
| **Java** | package: dotted names, "no significance in itself" [E] | nest (top-level type); package (default access); package plus subclasses (`protected`); JPMS module (`exports`) [E] | inheritance; lexical nest, flattened [E] | `exports ... to` ("friends"), `permits`; package access 1995 (one level), JPMS 2017 (flat) [E] |
| **C#, VB.NET** | namespace: nests, name resolution only, "no access restrictions" [E] | type; assembly (`internal`, `Friend`); file (`file`, C# 11) [E] | inheritance (`protected`, `private protected`); nested type reads the containing type's privates [E] | `InternalsVisibleTo`; `internal` 2002, `file` 2022, both flat [E] |
| **Kotlin** | package: names only; no package-private [E] | class; file (top-level `private`); module (`internal`) [E] | inheritance; outer does not see inner's privates [E] | none (test sees `main`); `internal` from 1.0, flat [E/M] |
| **Scala** | package: nests as real scopes [E] | class plus companion; any enclosing class or package (`private[C]`) [E] | inheritance, and the package tree, transitive downward [E] | none needed; nothing added [I] |
| **Swift** | module: does not nest [E] | declaration plus same-file extensions; file; module (default); package (2023); `open` versus `public` [E] | inheritance, gated by `open` at the module boundary [E] | `@testable import` (consumer-declared); `package` 2023, submodule tree rejected [E] |
| **Object Pascal, Delphi** | unit: does not nest [E/M] | unit (`private`, `protected`); class (`strict private`) [E] | inheritance (`protected` crosses units) [E] | none; co-location replaces `friend`; `strict private` 2005 [S] |
| **D** | module = file, package = directory: nests and carries visibility [E] | module (`private`); innermost package; ancestor subtree (`package(a.b)`); module plus derived (`protected`) [E] | the package tree, and inheritance [E] | none by design; `package(a.b)` 2015, ancestor-scoped [E] |
| **Dart** | library = file plus parts, addressed by URI [E] | library only (`_`); no class-private [E] | none [E] | none; `part of` widens the library; `lib/src` convention [E] |
| **Ruby** | module or class: nests for constant lookup [E] | method by call form; constants via `private_constant` [E] | inheritance (`protected`; receiverless `private`) [E] | none; `send` bypasses; refinements are lexical [E] |
| **Python** | module, package: dotted directories, no visibility [E] | none enforced; `_` convention; `__x` mangling [E] | PEP 8's containing-namespace rule, as convention [E] | `__all__` export list; nothing enforced [E] |
| **PHP** | namespace (5.3, 2009): nests by name only [E] | class only [E] | inheritance (`protected`) [E] | none; `@internal` docblock [E] |
| **Common Lisp, CLOS** | package: flat [E] | package (internal versus external symbols); slots none [E/I] | `use-package` inherits external symbols only [E] | `export`, `import` lists; `::` bypass [E] |
| **Crystal** | class, module, struct namespaces: nest [E] | file (top-level `private`); namespace (private types, `protected`); type [E] | own namespace, one level [E] | none [I] |
| **Nim, Julia** | module: file (Nim); nested `module` blocks (Julia) [E] | Nim `*` export marker, also on fields; Julia none [E] | none [E] | Nim `export`; Julia `export`, `public` markers [E] |
| **Oberon, Oberon-2** | module: flat; Modula-2's local modules dropped [E] | module export marks `*` and `-`; record fields public or private relative to the module [E] | none; type extension without class-private [E] | none [E] |
| **Modula-3** | interface, module: global names [E] | interface membership; opaque types revealed per scope [E] | none on the type [E] | private interfaces as friendship [E] |
| **BETA** | patterns nest to arbitrary depth [E] | fragment system outside the language: interface versus body fragments [E] | none by nesting: "no such protection mechanism" [E] | fragments; nothing in the language [E] |
| **Newspeak** | no global namespace; class nesting is the namespace [E] | object-level `private`, `protected` within the enclosing scope [E] | the containment tree (`outer` sends) [E] | none; research language [E] |
| **TypeScript, JavaScript, npm** | ES module = file, flat; legacy `namespace` nests with lexical visibility; npm package name [E] | class (`#` hard, `private` soft); file (`export`); namespace body; package (`exports` map) [E] | inheritance (`protected`, soft); namespace nesting, deprecated [E] | none; `@internal` redacts `.d.ts` only; `exports` (Node 12.7, 2019) flat subpath allowlist; `#` in ES2022 [E] |

**[I]** Read down the fourth column: the only rows where the file or package
tree carries visibility are Scala, D, Newspeak, and the retired TypeScript
`namespace`. Read down the fifth: every unit added after a language's first
release is flat, and the only nesting addition anywhere is D's `package(a.b)`.

### 11. The hierarchies OOP actually uses for visibility

**(a) The inheritance tree, through `protected`: used, and regretted.**
Simula's `protected` and Java's `protected` (subclasses, unioned with the
package) are genuine tree-shaped visibility [E]. Eiffel's selective export
propagates down the client's inheritance tree: "A feature available to a
class is also available to all the proper descendants of that class" [E].
The literature turned against this tree within a decade. Snyder 1986: free
access to inherited state means "the designer can no longer safely rename,
remove, or reinterpret an instance variable" [E]. The Gang of Four (1994):
"it's often said that 'inheritance breaks encapsulation' [Sny86]", hence
"Favor object composition over class inheritance" [E]. Bloch, Effective Java,
Item 15: "A protected member is part of the class's exported API and must be
supported forever. Also, a protected member of an exported class represents a
public commitment to an implementation detail ... The need for protected
members should be relatively rare"; Item 19: "prohibit subclassing in classes
that are not designed and documented to be safely subclassed" [E, 3rd ed.].
The languages followed. C# made methods non-virtual by default, Hejlsberg:
people "are very bad about thinking about the outgoing contract" [E, Artima
2003]. Kotlin made classes final by default and, until 2018, cited Bloch's
item by number in its own docs [E, kotlin-web-site history]. Swift's SE-0117
split `open` from `public` because subclassing "Within a single module ...
can be tolerable, but across library boundaries it's very problematic" [E].
Java's `sealed ... permits` (JEP 409, 2021) makes the heir list explicit and
confines it: "The sealed class and its permitted subclasses must belong to
the same module"; and "It is not a goal to provide new forms of access
control such as 'friends'" [E].

**[I]** The one tree-shaped visibility relation mainstream OOP adopted is the
one it has spent thirty years fencing in, and every fence is flat: a `final`
default, a module-boundary flag, a `permits` list.

**(b) Lexical containment: used inside one compilation unit, and flattened.**
Java's `private` reaches the whole top-level type, so nesting depth carries
no information; JEP 181 says so ("undifferentiated, flat") [E]. C++: "The
members of an enclosing class have no special access to members of a nested
class", while a nested class "has the same access rights as any other member"
and access is "transitive and cumulative to nested and local classes" [E].
C#: a nested type reads its containing type's privates [E]. Kotlin: "an outer
class does not see private members of its inner classes" [E]. Swift's
`private` widens sideways to same-file extensions [E]. TypeScript's legacy
`namespace` had the Rust rule inside one file: non-exported names visible in
the namespace body, including nested namespaces [E]. BETA nests object
descriptors "to an arbitrary depth" and "contains no such protection
mechanism; instead, the modularization described in Chapter 17 is used",
that chapter being a fragment system "not considered part of the BETA
language" [E]. Newspeak is the one design that makes nesting carry
everything: "Modularity in Newspeak is based exclusively on class nesting.
There are no separate modularity constructs such as packages"; "there is no
global namespace"; members "that are private or protected can only be
referenced within the scope of the object" [E]. Its authors state the costs:
nested classes are per-instance, so the namespace is a runtime object, and
every dependency is threaded in as a constructor parameter [E].

**(c) The package or namespace tree: almost never.** Java, C++, C#, Kotlin,
Swift, PHP, Ruby, Python, Common Lisp, Eiffel, Smalltalk-80 and Oberon all
answer no [E]. The exceptions inside the OOP family are Scala's `private[C]`
("including packages contained in it") [E], D's `package(a.b)` ("visible in
the specified package and all of its descendants") [E], and VisualWorks
Smalltalk's private namespace bindings [E, mirror]. Outside it, Ada 95's
private child units, with the design rationale "We want all source code that
can depend on information from the private part of a library unit to be
inside the 'subsystem' rooted at the library unit" [E, Annotated Ada
Reference Manual §10.1.1], and Rust: "If an item is private, it may be
accessed by the current module and its descendants", plus `pub(in path)`
[E]. Ada and Rust have no class to merge the module into; Scala and D are the
mixed-paradigm languages that added the rule anyway, and neither community
treats it as controversial [I].

**[I]** The hierarchies mainstream OOP is willing to use for visibility are
the ones that end at a compilation unit: the class body, the top-level type,
the module. The package tree is the one that would have to span files, and
would make visibility a property of the project layout rather than of a
text. Ada, Scala, D and Rust accepted that consequence.

### 12. Lists versus regions

Whenever a mainstream language needed to say "these specific units may see
this", it enumerated them:

- **Eiffel** `feature {A, B, C}` (1988): per feature clause, descendant-closed,
  and with "no validity constraint" on the list, which may name a class that
  does not exist [E, ECMA-367 §8.7.9].
- **C++** `friend`: "given permission to name the private and protected
  members of the class"; "Friendship is neither inherited nor transitive" [E].
- **.NET** `InternalsVisibleTo`: names a consumer assembly, grants the whole
  internal surface, never `private` [E].
- **Java** `exports ... to`: the targets "are referred to as friends of the
  current module"; and `permits` [E].
- **Swift** `@testable import`: the consumer asserts the grant, the producer
  names nobody [E].
- **Node** `exports`: an allowlist of subpaths, never of importers [E/I].

Meyer states the preference as a maxim: "a typical case of how a simple,
low-tech idea can outperform the heavy artillery of a 'powerful' mechanism"
[E]. **[I]** The list is location-independent, which is what Nx tags and
Bazel package groups offer in Part I, section 4; the region is what Scala, D,
Ada and Rust offer, and what ramify offers: a subtree named by an ancestor
instead of a set of consumers named one by one. The two shapes answer
different questions. A list says who; a region says where, and therefore also
what the decomposition is.

### 13. Consequences for ramify's argument

Where ramify sits in these terms: a group of files with a declared boundary
and an interface, inside which files share everything, is the D and Delphi
rule ("co-location is the friend mechanism") one level above the file.
Between groups, visibility follows the containment tree with one decision per
hop, which is the D `package(a.b)` and Scala `private[outerpkg]` grant
declared through the ancestors instead of by the owner alone. Classes play no
part, which matches TypeScript, where the file rather than the class is the
module.

Objections from this literature, in the order they will come up:

1. **Meyer's super-module objection.** "A completely new and partly
   incompatible module level", and "we will not be able to reuse it by
   itself" [E]. The first does not transfer: in TypeScript the class is not
   the module, the file is, and ramify's unit repeats the file's two
   ingredients rather than adding a third kind of rule. The second is real
   and is the cost already named in section 7, item 2: a symbol deep in a
   subtree is reusable elsewhere only after being lifted through its
   ancestors. The argument should say that this is the point, not a defect.
2. **Swift's layout objection.** A tree in the source is "source- and
   ABI-affecting" [E], and visibility becomes a property of the project
   layout rather than of a text (section 11). ramify accepts this on
   purpose: the directory tree is meant to be the architecture, moving a file
   changes what it can reach, and nothing binary is affected. Say it out
   loud; readers coming from Swift, C# or Java will otherwise assume it was
   overlooked.
3. **The intuition inside a nest.** JEP 181: users of nested classes "expect
   them to share a common access control regime", which is why Java
   flattened its nest [E]. Inside a ramify module the same intuition holds:
   every file sees every other. Between modules the rule is D's "no friends
   in other files" applied to directories. The learnability objection of
   section 7, item 8, is therefore about the between-module rule only.
4. **Which hierarchy, again.** OOP readers have exactly one tree-shaped
   visibility relation in their hands, `protected`, and thirty years of
   advice against it. State early that ramify's tree is containment, not
   inheritance, and that the two are unrelated; Bloch's "public commitment to
   an implementation detail" is precisely what a module interface is not.

Evidence the page can lean on: Odersky, "once a definition escapes its
immediate package boundary, it is visible to the world at large" [E]; the Ada
rationale on the subsystem rooted at a library unit [E]; D's "Being able to
declare a 'friend' that is somewhere in some other file runs against notions
of encapsulation" [E]; and the return of the file as an encapsulation unit
across Kotlin, Swift, C# 11, D, Dart and Crystal, of which a multi-file
module is one more step [E for each; I for the reading].

What not to claim: that OOP languages lack hierarchical visibility. They have
it on the inheritance tree and inside a compilation unit. The claim that
holds is narrower: none of the mainstream ones carries visibility on the file
or package tree above the compilation unit, and the two mixed-paradigm
languages that do, Scala and D, find it uncontroversial.

## Sources

Part I fetched: patternlanguage.com (Alexander 1965);
bazel.build/concepts/visibility;
doc.rust-lang.org/reference/visibility-and-privacy.html;
rust-lang.github.io/rfcs/2126-path-clarity.html;
aturon.github.io/blog/2017/07/26/revisiting-rusts-modules/; go.dev/doc/go1.4;
go.dev/doc/modules/layout; github.com/golang-standards/project-layout/issues/117;
nx.dev/features/enforce-module-boundaries;
abseil.io/resources/swe-book/html/ch18.html; Chromium
docs/code_reviews.md; buck2.build/docs/concepts/visibility/; pantsbuild.org
blog, 2023-04-25; haskell.org/onlinereport/haskell2010/haskellch5.html;
discourse.haskell.org/t/pvp-compliance-of-internal-modules/6784;
docs.oracle.com/javase/specs/jls/se21/html/jls-7.html;
dev.java/learn/modules/intro/; simonbrown.je/modular-monolith/;
github.com/dotnet/csharplang/issues/6794;
kotlinlang.org/docs/visibility-modifiers.html; swift-evolution SE-0386;
Scala 2.13 specification ch. 5; Ada 95 Rationale ch. 10 (adaic.org);
ocaml.org/manual/5.5/moduleexamples.html; dune library stanza documentation;
lists.ocaml.org/pipermail/platform/2013-February/000191.html;
cs.princeton.edu/research/techreps/255 (SML/NJ CM);
boundary.hexdocs.pm/Boundary.html; peps.python.org/pep-0008/; Gradle
java_library plugin documentation; cs.utexas.edu EWD196 (Dijkstra 1968);
blog.acolyer.org, 2016-10-31 (Parnas 1979); OpenAlex abstracts (Tarr 1999,
MacCormack 2006, Parnas 1985); ideas.repec.org (Hidden Structure 2014);
designsociety.org (Sturtevant 2013); almossawi.com/firefox/;
melconway.com (Conway 1968); programming-journal.org/2023/7/8/; Wikipedia
(Structure chart; A City Is Not a Tree). Extracted from PDFs: Kiczales et al.
1997 (cs.ubc.ca); Wirth, HOPL-III (people.inf.ethz.ch); Simon 1962
(iastate.edu).

Part II fetched: bertrandmeyer.com (OOSC-2 PDF); se.inf.ethz.ch (Meyer, "Basic
Eiffel language mechanisms", 2006); ecma-international.org (ECMA-367 2nd ed.);
cs.tufts.edu (Snyder 1986); bracha.org (Bracha et al. 2010);
newspeaklanguage.org (draft specification); beta.cs.au.dk (the BETA book);
stroustrup.com (HOPL-2, HOPL-3, "An Overview of the C++ Programming
Language", D&E preface); eel.is and github.com/cplusplus/draft (C++ working
draft: basic.namespace, namespace.def, module.unit, module.private.frag,
class.access, class.friend, basic.link); cppreference.net mirror (modules);
cor3ntin.github.io (module naming); people.inf.ethz.ch (Oberon Report 1990;
Wirth, "Modula-2 and Oberon"); vishap.oberon.am (Oberon-2 Report);
modula3.github.io and softwarepreservation.computerhistory.org (Modula-3
definition; SRC-RR-52); cs.virginia.edu (Ingalls 1981); Blue Book OCR text
layer; SquareBracketAssociates Pharo by Example sources; Ducasse, Pharo with
Style; Cincom Application Developer's Guide ch. 6 (mirror); ObjectShare press
releases, December 1998 and March 1999 (Wayback Machine);
portablesimula.github.io (SIMULA Standard 1986); Common Base Language 1970
(softwarepreservation.computerhistory.org); Dahl 2001 (uio.no); Pooley, An
Introduction to Programming in Simula, ch. 18; docs.oracle.com JLS SE 21 §6
and §7; openjdk.org JEP 181, JEP 409, "The State of the Module System";
cr.openjdk.org nestmates specification; dotnet/csharpstandard draft-v8
(basic-concepts, namespaces); learn.microsoft.com (access modifiers, file,
internal, virtual, InternalsVisibleToAttribute, Friend, C# version history);
artima.com (Hejlsberg 2003; Odersky, "Chained Package Clauses", 2010;
Programming in Scala 1st ed. ch. 13); kotlinlang.org (visibility modifiers,
inheritance) and the JetBrains kotlin-web-site repository history;
scala-lang.org specification 2.13 §5.2 and ch. 9; docs.scala-lang.org (Scala
3 dropped features); swiftlang/swift-book AccessControl; swift-evolution
SE-0117 and SE-0386; developer.apple.com Objective-C archive;
typescriptlang.org (namespaces, classes, stripInternal) and the TypeScript
specification v1.8 (release-2.2 doc/spec.md); nodejs.org packages
documentation; tc39 proposal-class-fields FAQ and finished-proposals;
groovy-lang.org; docwiki.embarcadero.com (Wayback Machine snapshot);
freepascal.org reference §6.1; dlang.org specification (attribute, module),
changelogs 2.067.0 and 2.071.0, blog.dlang.org 2018-11-06; dart.dev and
spec.dart.dev; docs.ruby-lang.org and ruby/ruby NEWS-1.9.3; docs.python.org
and PEP 8; php.net manual and 5.3.0 release, wiki.php.net namespaces RFC,
docs.phpdoc.org; Common Lisp HyperSpec ch. 11; crystal-lang.org;
nim-lang.org; docs.julialang.org; doc.rust-lang.org reference;
ada-auth.org RM and AARM §10.1.1; Effective Java 3rd ed. (Items 15, 18, 19);
Design Patterns ch. 1 (Addison-Wesley CD edition and book PDF).

Part II could not fetch: Stroustrup, The Design and Evolution of C++, ch. 17
(lending copy only; recollections marked [M]); Szyperski 1992 full text
(quoted only through Bracha et al.) and Component Software; cppreference.com
(HTTP 403; the .net mirror was used); Kotlin's `internal` introduction date;
Cincom VisualWorks documentation directly (a mirror was used); the 1984
Common Base Language revision; a primary statement by Matz on Ruby `private`;
Delphi 2005 release notes for `strict private`; Effective Java 2nd ed. body
text.
