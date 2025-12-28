# CF-0028: Workflow Engine Feature Completeness - Specification

**Task ID**: CF-0028
**GitHub Issue**: #28
**Tier**: 3 (Complex)
**Estimated Hours**: 116
**Branch**: `CF-0028-workflow-engine-feature-completeness`
**Status**: Specification Phase
**Created**: 2025-12-28

---

## 1. Executive Summary

This specification defines the requirements for bringing the automation-executor.js workflow engine from 30-40% feature completeness to full SPARC workflow support. The enhancement comprises 8 sub-issues organized into HIGH priority (critical path) and MEDIUM priority (enhancements) categories.

### 1.1 Scope

**Primary Enhancement Target**: `/Users/davidshepherd/projects/claude-flow/src/cli/simple-commands/automation-executor.js`

**Sub-Issues**:
| Issue | Feature | Priority | Dependency Chain |
|-------|---------|----------|------------------|
| #29 | Prerequisites Validation | HIGH | None |
| #31 | Checkpoint Enforcement | HIGH | #29 |
| #32 | Iterative Tasks | HIGH | #31 |
| #37 | Phase Loop-Back | HIGH | #32 |
| #33 | HiveMind Workers | MEDIUM | #37 |
| #34 | Hybrid Execution Mode | MEDIUM | #33 |
| #35 | Workflow-Level Hooks | MEDIUM | #34 |
| #36 | Extended Variable Interpolation | MEDIUM | #35 |

---

## 2. Feature Requirements

### 2.1 Prerequisites Validation (#29)

**Purpose**: Validate that required artifacts exist before workflow execution begins.

#### 2.1.1 Functional Requirements

| ID | Requirement | Priority | Testable |
|----|-------------|----------|----------|
| FR-29-01 | System SHALL parse `prerequisites` array from workflow YAML/JSON | HIGH | Yes |
| FR-29-02 | System SHALL validate file artifacts exist at specified paths | HIGH | Yes |
| FR-29-03 | System SHALL validate memory keys exist in AgentDB/memory store | HIGH | Yes |
| FR-29-04 | System SHALL execute validation scripts when `validationScript` is specified | MEDIUM | Yes |
| FR-29-05 | System SHALL fail workflow with descriptive error when prerequisites not met | HIGH | Yes |
| FR-29-06 | System SHALL support glob patterns in file prerequisites | MEDIUM | Yes |
| FR-29-07 | System SHALL support optional prerequisites with `required: false` flag | LOW | Yes |

#### 2.1.2 Non-Functional Requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-29-01 | Prerequisite validation SHOULD complete within 5 seconds | <5s |
| NFR-29-02 | System SHALL handle 100+ prerequisite checks per workflow | 100+ |
| NFR-29-03 | Memory key validation SHALL use existing MCP memory tools | Compatibility |

#### 2.1.3 Interface Contract

**Input Schema**:
```yaml
prerequisites:
  - type: "file"
    path: "docs/features/${taskId}/specification.md"
    required: true
  - type: "memory"
    key: "docs/features/${taskId}/architecture"
    required: true
  - type: "artifact"
    validationScript: "npm run validate:design"
    required: true
```

**Output**:
```typescript
interface PrerequisiteResult {
  valid: boolean;
  failedPrerequisites: {
    type: 'file' | 'memory' | 'artifact';
    path?: string;
    key?: string;
    error: string;
  }[];
  passedCount: number;
  totalCount: number;
}
```

**Errors**:
- `PREREQUISITE_FILE_NOT_FOUND`: File at path does not exist
- `PREREQUISITE_MEMORY_KEY_MISSING`: Memory key not found in store
- `PREREQUISITE_VALIDATION_FAILED`: Validation script returned non-zero exit code

#### 2.1.4 Integration Points

**Existing Code Hook**: `validateWorkflow()` at line 99 of automation-executor.js
```javascript
// Current implementation (line 1423-1448)
validateWorkflow(workflow) {
  if (!workflow.name) {
    throw new Error('Workflow name is required');
  }
  // ... basic validation
}

// Extension point: Add prerequisites validation after basic validation
```

---

### 2.2 Checkpoint Enforcement (#31)

**Purpose**: Enforce quality gates with iteration support for automated remediation.

#### 2.2.1 Functional Requirements

| ID | Requirement | Priority | Testable |
|----|-------------|----------|----------|
| FR-31-01 | System SHALL evaluate checkpoint conditions after each phase | HIGH | Yes |
| FR-31-02 | System SHALL detect issues via configurable validation rules | HIGH | Yes |
| FR-31-03 | System SHALL re-invoke SPARC commands when issues detected | HIGH | Yes |
| FR-31-04 | System SHALL support `maxIterations` cap per checkpoint | HIGH | Yes |
| FR-31-05 | System SHALL store iteration metrics in AgentDB | MEDIUM | Yes |
| FR-31-06 | System SHALL emit events on checkpoint pass/fail | MEDIUM | Yes |
| FR-31-07 | System SHALL support circuit breaker pattern for infinite loops | HIGH | Yes |

#### 2.2.2 Non-Functional Requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-31-01 | Checkpoint evaluation SHOULD complete within 10 seconds | <10s |
| NFR-31-02 | System SHALL prevent infinite loops via maxIterations | Safety |
| NFR-31-03 | All checkpoint state SHALL be recoverable after crash | Reliability |

#### 2.2.3 Interface Contract

**Input Schema**:
```yaml
checkpoints:
  - name: "post-tdd-validation"
    phase: "refinement-tdd"
    type: "post"
    validations:
      - name: "tests_passing"
        command: "npm test"
        expectedExitCode: 0
      - name: "coverage_threshold"
        command: "npm run test:coverage"
        threshold: 90
    onFailure:
      action: "iterate"
      targetCommand: "/sparc-tdd"
      maxIterations: 3
      issueContext: true
```

**Output**:
```typescript
interface CheckpointResult {
  checkpointId: string;
  passed: boolean;
  iterations: number;
  validationResults: {
    name: string;
    passed: boolean;
    output: string;
    duration: number;
  }[];
  finalAction: 'passed' | 'failed_max_iterations' | 'failed_circuit_breaker';
}
```

**Errors**:
- `CHECKPOINT_MAX_ITERATIONS_EXCEEDED`: Checkpoint failed after maxIterations attempts
- `CHECKPOINT_CIRCUIT_BREAKER_TRIGGERED`: Same failure detected repeatedly
- `CHECKPOINT_VALIDATION_TIMEOUT`: Validation command exceeded timeout

#### 2.2.4 Integration Points

**Existing Code**: `checkpoint-manager.ts` provides state management
```typescript
// From /Users/davidshepherd/projects/claude-flow/src/verification/checkpoint-manager.ts
async createCheckpoint(
  description: string,
  scope: CheckpointScope,
  agentId?: string,
  taskId?: string,
  validations: Validation[] = []
): Promise<string>
```

**Extension**: Create `checkpoint-enforcer.ts` that uses CheckpointManager for:
- Checkpoint creation with validations
- Iteration tracking
- SPARC command re-invocation

---

### 2.3 Iterative Tasks (#32)

**Purpose**: Support TDD red-green-refactor cycles with per-iteration storage.

#### 2.3.1 Functional Requirements

| ID | Requirement | Priority | Testable |
|----|-------------|----------|----------|
| FR-32-01 | System SHALL support `maxIterations` property on tasks | HIGH | Yes |
| FR-32-02 | System SHALL expose `${iteration}` variable during execution | HIGH | Yes |
| FR-32-03 | System SHALL store per-iteration results in AgentDB | HIGH | Yes |
| FR-32-04 | System SHALL support iteration-specific continuation conditions | MEDIUM | Yes |
| FR-32-05 | System SHALL preserve iteration context for debugging | MEDIUM | Yes |
| FR-32-06 | System SHALL support TDD cycle with red/green/refactor phases | HIGH | Yes |

#### 2.3.2 Non-Functional Requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-32-01 | Iteration state SHOULD be queryable during execution | Observability |
| NFR-32-02 | Per-iteration storage SHOULD use path pattern: `docs/features/{taskId}/iteration-{N}` | Consistency |

#### 2.3.3 Interface Contract

**Input Schema**:
```yaml
tasks:
  - id: "tdd-cycle"
    type: "iterative"
    maxIterations: 10
    continueCondition:
      type: "command"
      command: "npm test"
      expectSuccess: true
    onIteration:
      storeResult: true
      memoryKeyPattern: "docs/features/${taskId}/iteration-${iteration}"
    phases:
      - name: "red"
        action: "Write failing test"
      - name: "green"
        action: "Write code to pass"
      - name: "refactor"
        action: "Improve code quality"
```

**Output**:
```typescript
interface IterativeTaskResult {
  taskId: string;
  totalIterations: number;
  completedIterations: number;
  iterations: {
    number: number;
    phase: string;
    result: any;
    memoryKey: string;
    duration: number;
  }[];
  finalStatus: 'completed' | 'max_iterations' | 'condition_met';
}
```

#### 2.3.4 Integration Points

**Extension Point**: `executeTask()` at line 1021 of automation-executor.js
```javascript
// Current single execution
async executeTask(task, workflow) {
  const startTime = Date.now();
  // ... single execution logic
}

// Extension: Wrap with iteration loop
async executeIterativeTask(task, workflow) {
  for (let i = 1; i <= task.maxIterations; i++) {
    const result = await this.executeTask({...task, iteration: i}, workflow);
    // Store iteration result
    // Check continuation condition
  }
}
```

---

### 2.4 Phase Loop-Back (#37)

**Purpose**: Support review-to-TDD cycle for quality assurance in higher tiers.

#### 2.4.1 Functional Requirements

| ID | Requirement | Priority | Testable |
|----|-------------|----------|----------|
| FR-37-01 | System SHALL support `loopBack` property on tasks | HIGH | Yes |
| FR-37-02 | System SHALL evaluate loop conditions at task completion | HIGH | Yes |
| FR-37-03 | System SHALL jump to target task when conditions met | HIGH | Yes |
| FR-37-04 | System SHALL support `maxLoops` cap to prevent infinite loops | HIGH | Yes |
| FR-37-05 | System SHALL pass issue context from review to target | HIGH | Yes |
| FR-37-06 | System SHALL track loop count per phase pair | MEDIUM | Yes |
| FR-37-07 | System SHALL execute intermediate phases when looping | MEDIUM | Yes |

#### 2.4.2 Non-Functional Requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-37-01 | Loop detection SHOULD prevent runaway execution | Safety |
| NFR-37-02 | Issue context SHOULD be structured for automated processing | Usability |

#### 2.4.3 Interface Contract

**Input Schema**:
```yaml
tasks:
  - id: "review-phase"
    type: "review"
    loopBack:
      enabled: true
      condition:
        type: "issues_detected"
        severityThreshold: "high"
      target: "tdd-phase"
      maxLoops: 3
      includeContext: true
      reExecuteIntermediatePhases: false
```

**Output**:
```typescript
interface LoopBackResult {
  loopTriggered: boolean;
  loopCount: number;
  targetTask: string;
  issueContext: {
    issues: {
      severity: 'critical' | 'high' | 'medium' | 'low';
      description: string;
      file?: string;
      line?: number;
    }[];
  };
  terminationReason: 'issues_resolved' | 'max_loops_reached' | 'no_issues';
}
```

#### 2.4.4 Integration Points

**Extension Point**: `createExecutionPlan()` at line 1346
```javascript
// Current linear execution plan
createExecutionPlan(tasks, dependencies) {
  // ... creates phases based on dependencies
  return phases;
}

// Extension: Support dynamic re-planning on loop-back
modifyExecutionPlan(currentPlan, loopBackTarget) {
  // Reinsert target task and optionally intermediate phases
}
```

---

### 2.5 HiveMind Workers (#33)

**Purpose**: Spawn parallel workers for concurrent task execution.

#### 2.5.1 Functional Requirements

| ID | Requirement | Priority | Testable |
|----|-------------|----------|----------|
| FR-33-01 | System SHALL spawn workers per `hiveMindWorkers` config | HIGH | Yes |
| FR-33-02 | System SHALL distribute workload across workers | HIGH | Yes |
| FR-33-03 | System SHALL coordinate results from parallel workers | HIGH | Yes |
| FR-33-04 | System SHALL support consensus mechanisms for decisions | MEDIUM | Yes |
| FR-33-05 | System SHALL handle worker failures gracefully | HIGH | Yes |
| FR-33-06 | System SHALL support worker-specific capability assignment | MEDIUM | Yes |

#### 2.5.2 Non-Functional Requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-33-01 | Worker spawn time SHOULD be <2 seconds per worker | <2s |
| NFR-33-02 | System SHALL support up to 10 concurrent workers | 10 workers |
| NFR-33-03 | Worker coordination SHALL use existing HiveMind protocol | Compatibility |

#### 2.5.3 Interface Contract

**Input Schema**:
```yaml
tasks:
  - id: "parallel-analysis"
    type: "hive-mind"
    hiveMindWorkers: 5
    workerConfig:
      capabilities: ["research", "analyze"]
      consensusThreshold: 0.6
    workloadDistribution: "even"
    coordination:
      channel: "consensus"
      timeout: 60000
```

**Output**:
```typescript
interface HiveMindResult {
  taskId: string;
  workersSpawned: number;
  workerResults: {
    workerId: string;
    result: any;
    status: 'completed' | 'failed' | 'timeout';
    duration: number;
  }[];
  consensus: {
    reached: boolean;
    confidence: number;
    decision: any;
  };
}
```

#### 2.5.4 Integration Points

**Existing Code**: `hive-protocol.ts` provides communication infrastructure
```typescript
// From /Users/davidshepherd/projects/claude-flow/src/coordination/hive-protocol.ts
export class HiveCommunicationProtocol extends EventEmitter {
  sendMessage(message: Omit<HiveMessage, 'id' | 'timestamp'>): HiveMessage
  submitVote(requestId: string, agentId: string, vote: boolean, confidence: number)
  // ... consensus mechanisms
}
```

---

### 2.6 Hybrid Execution Mode (#34)

**Purpose**: Combine stream-chain sequential context with HiveMind parallel execution.

#### 2.6.1 Functional Requirements

| ID | Requirement | Priority | Testable |
|----|-------------|----------|----------|
| FR-34-01 | System SHALL use stream-chain as primary backbone | HIGH | Yes |
| FR-34-02 | System SHALL spawn HiveMind workers for parallel phases | HIGH | Yes |
| FR-34-03 | System SHALL aggregate HiveMind results to stream-chain context | HIGH | Yes |
| FR-34-04 | System SHALL support checkpoint arrays for validation | MEDIUM | Yes |
| FR-34-05 | System SHALL support rollback to last stream-chain checkpoint | MEDIUM | Yes |

#### 2.6.2 Non-Functional Requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-34-01 | Hybrid mode SHOULD achieve 2-4x speedup on parallelizable tasks | 2-4x |
| NFR-34-02 | Context preservation SHOULD be 100% through stream-chain | 100% |

#### 2.6.3 Interface Contract

**Input Schema**:
```yaml
executionMode: "hybrid"
streamChainConfig:
  preserveContext: true
  checkpointOnPhaseComplete: true
hiveMindConfig:
  workers: 5
  consensusThreshold: 0.7
phases:
  - name: "research"
    execution: "parallel"  # Use HiveMind
  - name: "implementation"
    execution: "sequential"  # Use stream-chain
```

**Output**:
```typescript
interface HybridExecutionResult {
  mode: 'hybrid';
  streamChainCheckpoints: string[];
  parallelPhases: {
    phaseName: string;
    workerCount: number;
    aggregatedResult: any;
  }[];
  sequentialPhases: {
    phaseName: string;
    contextPreserved: boolean;
  }[];
  totalDuration: number;
  speedupFactor: number;
}
```

#### 2.6.4 Integration Points

**Existing Code**: `stream-chain.js` for sequential execution
```javascript
// From /Users/davidshepherd/projects/claude-flow/src/cli/simple-commands/stream-chain.js
async function executeChain(prompts, flags) {
  let previousContent = null;
  for (let i = 0; i < prompts.length; i++) {
    const result = await executeStep(prompt, previousContent, ...);
    previousContent = result.content;  // Context preservation
  }
}
```

---

### 2.7 Workflow-Level Hooks (#35)

**Purpose**: Emit lifecycle events for workflow monitoring and automation.

#### 2.7.1 Functional Requirements

| ID | Requirement | Priority | Testable |
|----|-------------|----------|----------|
| FR-35-01 | System SHALL emit `on-workflow-start` hook at workflow begin | HIGH | Yes |
| FR-35-02 | System SHALL emit `on-checkpoint` hook at each checkpoint | HIGH | Yes |
| FR-35-03 | System SHALL emit `on-error` hook on any error | HIGH | Yes |
| FR-35-04 | System SHALL emit `on-workflow-complete` hook at workflow end | HIGH | Yes |
| FR-35-05 | System SHALL support async hook handlers | MEDIUM | Yes |
| FR-35-06 | System SHALL support hook handler registration at runtime | MEDIUM | Yes |

#### 2.7.2 Non-Functional Requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-35-01 | Hook execution SHOULD not block workflow execution | <100ms overhead |
| NFR-35-02 | Hooks SHOULD support external event systems | Extensibility |

#### 2.7.3 Interface Contract

**Input Schema**:
```yaml
hooks:
  on-workflow-start:
    - handler: "notify-slack"
      config:
        channel: "#builds"
    - handler: "store-metrics"
  on-checkpoint:
    - handler: "log-checkpoint"
    - handler: "update-dashboard"
  on-error:
    - handler: "alert-pagerduty"
      config:
        severity: "warning"
  on-workflow-complete:
    - handler: "cleanup-resources"
    - handler: "notify-completion"
```

**Hook Payload**:
```typescript
interface WorkflowHookPayload {
  workflowId: string;
  sessionId: string;
  hookType: 'on-workflow-start' | 'on-checkpoint' | 'on-error' | 'on-workflow-complete';
  timestamp: number;
  context: {
    currentPhase?: string;
    error?: Error;
    checkpointId?: string;
    metrics?: {
      duration: number;
      tasksCompleted: number;
      tasksTotal: number;
    };
  };
}
```

#### 2.7.4 Integration Points

**Existing Code**: `workflow-hooks.ts` provides hook infrastructure
```typescript
// From /Users/davidshepherd/projects/claude-flow/src/services/agentic-flow-hooks/workflow-hooks.ts
export const workflowStartHook = {
  id: 'agentic-workflow-start',
  type: 'workflow-start' as const,
  handler: async (payload, context): Promise<HookHandlerResult>
}
// Also: workflowStepHook, workflowDecisionHook, workflowCompleteHook, workflowErrorHook
```

**Extension**: Register additional hook types at line 1020

---

### 2.8 Extended Variable Interpolation (#36)

**Purpose**: Support rich context variables for dynamic workflow configuration.

#### 2.8.1 Functional Requirements

| ID | Requirement | Priority | Testable |
|----|-------------|----------|----------|
| FR-36-01 | System SHALL support task context variables `${task.*}` | HIGH | Yes |
| FR-36-02 | System SHALL support error context variables `${error.*}` | HIGH | Yes |
| FR-36-03 | System SHALL support checkpoint context variables `${checkpoint.*}` | HIGH | Yes |
| FR-36-04 | System SHALL support iteration context variables `${iteration.*}` | HIGH | Yes |
| FR-36-05 | System SHALL support nested variable access `${task.result.value}` | MEDIUM | Yes |
| FR-36-06 | System SHALL support default values `${var:-default}` | MEDIUM | Yes |
| FR-36-07 | System SHALL support conditional interpolation `${var:?error}` | LOW | Yes |

#### 2.8.2 Non-Functional Requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-36-01 | Interpolation SHOULD handle missing variables gracefully | Safety |
| NFR-36-02 | Deep object access SHOULD support 5+ levels | Flexibility |

#### 2.8.3 Interface Contract

**Supported Variables**:
```yaml
# Task Context
${task.id}           # Current task ID
${task.name}         # Current task name
${task.phase}        # Current phase name
${task.result}       # Previous task result
${task.duration}     # Task duration in ms

# Error Context
${error.message}     # Error message
${error.code}        # Error code
${error.stack}       # Stack trace (truncated)
${error.phase}       # Phase where error occurred

# Checkpoint Context
${checkpoint.id}     # Current checkpoint ID
${checkpoint.passed} # Boolean pass/fail
${checkpoint.iteration} # Iteration count

# Iteration Context
${iteration.current} # Current iteration number
${iteration.max}     # Maximum iterations
${iteration.result}  # Previous iteration result
```

**Output**:
```typescript
interface InterpolationResult {
  original: string;
  interpolated: string;
  resolvedVariables: {
    variable: string;
    value: any;
    source: 'task' | 'error' | 'checkpoint' | 'iteration' | 'default';
  }[];
  unresolvedVariables: string[];
}
```

#### 2.8.4 Integration Points

**Existing Code**: `applyVariables()` at line 1453
```javascript
// Current simple substitution
applyVariables(workflow, variables) {
  const allVariables = { ...workflow.variables, ...variables };
  let processedStr = JSON.stringify(workflow);
  for (const [key, value] of Object.entries(allVariables)) {
    const pattern = new RegExp(`\\$\\{${key}\\}`, 'g');
    processedStr = processedStr.replace(pattern, value);
  }
  return JSON.parse(processedStr);
}
```

**Extension**: Enhanced regex for nested access and defaults

---

## 3. Gap Analysis

### 3.1 Current State vs Required State

| Feature | Current State | Required State | Gap |
|---------|---------------|----------------|-----|
| Prerequisites Validation | None | Full validation of files/memory/scripts | Full implementation needed |
| Checkpoint Enforcement | Basic checkpoint creation | Enforcement with iteration and SPARC re-invocation | Major enhancement needed |
| Iterative Tasks | Single execution | Loop with per-iteration storage | New iteration executor needed |
| Phase Loop-Back | Linear execution only | Dynamic re-planning on review issues | Execution plan modification needed |
| HiveMind Workers | No integration | Full worker spawning and coordination | Integration with hive-protocol.ts needed |
| Hybrid Execution | stream-chain only | Combined stream-chain + HiveMind | Hybrid executor needed |
| Workflow Hooks | Basic start/complete | 4 hook types with context | Extension of workflow-hooks.ts needed |
| Variable Interpolation | Simple ${key} replacement | Context-aware nested interpolation | Enhanced parser needed |

### 3.2 Code Changes Required

**Files to Create**:
1. `src/cli/simple-commands/prerequisites-validator.js`
2. `src/verification/checkpoint-enforcer.ts`
3. `src/cli/simple-commands/iterative-executor.js`
4. `src/cli/simple-commands/loopback-handler.js`
5. `src/hive-mind/integration/worker-spawner.ts`
6. `src/cli/simple-commands/hybrid-executor.js`
7. `src/services/agentic-flow-hooks/extended-workflow-hooks.ts`
8. `src/cli/simple-commands/variable-interpolator.js`

**Files to Modify**:
1. `src/cli/simple-commands/automation-executor.js` - Core integration
2. `src/verification/checkpoint-manager.ts` - Enhanced validations
3. `src/services/agentic-flow-hooks/workflow-hooks.ts` - New hook types

---

## 4. Acceptance Criteria

### 4.1 Per-Feature Acceptance Criteria

#### AC-29: Prerequisites Validation
```gherkin
Feature: Prerequisites Validation

  Scenario: Validate file prerequisites
    Given a workflow with file prerequisites
    When the workflow starts execution
    Then the system validates all file paths exist
    And blocks execution if any file is missing
    And provides descriptive error for missing files

  Scenario: Validate memory key prerequisites
    Given a workflow with memory key prerequisites
    When the workflow starts execution
    Then the system checks AgentDB for required keys
    And blocks execution if any key is missing

  Scenario: Execute validation script
    Given a workflow with a validationScript prerequisite
    When the workflow starts execution
    Then the system runs the validation script
    And blocks execution if script returns non-zero
```

#### AC-31: Checkpoint Enforcement
```gherkin
Feature: Checkpoint Enforcement

  Scenario: Re-invoke on checkpoint failure
    Given a checkpoint with validation rules
    And maxIterations set to 3
    When validation fails
    Then the system re-invokes the target SPARC command
    And passes issue context to the command
    And increments iteration counter

  Scenario: Respect maxIterations limit
    Given a checkpoint with maxIterations: 3
    When validation fails 3 times
    Then the system stops iteration
    And marks checkpoint as failed
    And emits CHECKPOINT_MAX_ITERATIONS_EXCEEDED error
```

#### AC-32: Iterative Tasks
```gherkin
Feature: Iterative Tasks

  Scenario: Execute iterative task
    Given a task with maxIterations: 10
    When the task executes
    Then each iteration stores results at iteration-{N} key
    And exposes ${iteration} variable
    And checks continueCondition after each iteration

  Scenario: TDD red-green-refactor cycle
    Given a TDD task with red/green/refactor phases
    When executing iteration N
    Then red phase writes failing test
    Then green phase writes passing code
    Then refactor phase improves quality
    And results stored at iteration-{N}
```

#### AC-37: Phase Loop-Back
```gherkin
Feature: Phase Loop-Back

  Scenario: Loop from review to TDD
    Given a review task with loopBack.target: "tdd-phase"
    When review detects HIGH severity issues
    Then execution jumps to tdd-phase
    And passes issue context
    And increments loop counter

  Scenario: Respect maxLoops
    Given loopBack.maxLoops: 3
    When review detects issues 3 times
    Then loop-back stops
    And workflow continues to next phase
```

#### AC-33: HiveMind Workers
```gherkin
Feature: HiveMind Workers

  Scenario: Spawn workers per config
    Given a task with hiveMindWorkers: 5
    When the task executes
    Then 5 workers are spawned
    And workload is distributed evenly
    And results are coordinated via consensus
```

#### AC-34: Hybrid Execution Mode
```gherkin
Feature: Hybrid Execution Mode

  Scenario: Combine stream-chain and HiveMind
    Given executionMode: "hybrid"
    And phases with mixed execution types
    When the workflow executes
    Then sequential phases use stream-chain
    And parallel phases use HiveMind workers
    And context is preserved across transitions
```

#### AC-35: Workflow-Level Hooks
```gherkin
Feature: Workflow-Level Hooks

  Scenario: Emit on-workflow-start
    Given hooks.on-workflow-start handlers defined
    When the workflow starts
    Then all handlers are invoked with workflow context
    And handler execution does not block workflow

  Scenario: Emit on-error
    Given hooks.on-error handlers defined
    When an error occurs during execution
    Then all handlers are invoked with error context
    And workflow can continue or abort based on handler result
```

#### AC-36: Variable Interpolation
```gherkin
Feature: Extended Variable Interpolation

  Scenario: Interpolate task context
    Given a template with ${task.id} and ${task.result.value}
    When interpolation runs after task completion
    Then variables are replaced with actual task data

  Scenario: Handle missing variables
    Given a template with ${missing.variable}
    When interpolation runs
    Then missing variable is replaced with empty string
    And a warning is logged
```

---

## 5. Risk Assessment

### 5.1 Technical Risks

| Risk ID | Description | Probability | Impact | Mitigation |
|---------|-------------|-------------|--------|------------|
| R-01 | Infinite loops in checkpoint iteration | Medium | High | maxIterations cap + circuit breaker pattern |
| R-02 | HiveMind integration conflicts | Low | Medium | Abstraction layer + thorough integration testing |
| R-03 | Variable interpolation edge cases | Low | Medium | Comprehensive test coverage + safe defaults |
| R-04 | Phase loop-back complexity | Medium | Medium | Prototype first + time-boxed research |
| R-05 | Stream-chain context loss in hybrid mode | Medium | High | Checkpoint on every transition |

### 5.2 Integration Risks

| Risk ID | Description | Probability | Impact | Mitigation |
|---------|-------------|-------------|--------|------------|
| R-06 | Rule 10 violations in tests | Medium | High | Strict TDD with real components only |
| R-07 | Breaking existing workflow behavior | Low | High | Comprehensive regression tests |
| R-08 | Memory key conflicts | Low | Low | Namespace isolation per workflow |

---

## 6. Dependency Order

```
                 +----------------+
                 | #29 Prereqs    |
                 +-------+--------+
                         |
                         v
                 +----------------+
                 | #31 Checkpoint |
                 +-------+--------+
                         |
                         v
                 +----------------+
                 | #32 Iterative  |
                 +-------+--------+
                         |
                         v
                 +----------------+
                 | #37 Loop-Back  |
                 +-------+--------+
                         |
                         v
                 +----------------+
                 | #33 HiveMind   |
                 +-------+--------+
                         |
                         v
                 +----------------+
                 | #34 Hybrid     |
                 +-------+--------+
                         |
                         v
                 +----------------+
                 | #35 Hooks      |
                 +-------+--------+
                         |
                         v
                 +----------------+
                 | #36 Variables  |
                 +----------------+
```

**Critical Path**: #29 -> #31 -> #32 -> #37 (HIGH priority features)
**Enhancement Path**: #33 -> #34 -> #35 -> #36 (MEDIUM priority features)

---

## 7. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Test Coverage | >= 90% | `npm run test:coverage` |
| Lint Errors | 0 | `npm run lint` |
| Type Errors | 0 | `npm run typecheck` |
| Tier 1-4 Workflows | All passing | `npm run test:e2e -- sparc-tier` |
| Performance Regression | None | Benchmark comparison |

---

## 8. Related Artifacts

- Goal Plan: `docs/features/CF-0028/goal-plan.json`
- Architecture: `docs/features/CF-0028/architecture.md` (to be created)
- Test Plan: `docs/features/CF-0028/test-plan.md`
- Memory Keys: `docs/features/CF-0028/*` (Rule 9 compliance)

---

**Document Version**: 1.0.0
**Last Updated**: 2025-12-28
**Author**: SPARC Specification Agent
**Status**: Complete - Ready for Architecture Phase
