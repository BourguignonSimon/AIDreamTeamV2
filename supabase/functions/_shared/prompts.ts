/**
 * Prompt Engineering Specifications for All Pipeline Steps
 *
 * Each step has a dedicated versioned system prompt following the structure:
 * 1. Role definition
 * 2. Task framing
 * 3. Output schema (mandatory JSON)
 * 4. Quality constraints
 * 5. Language instruction
 *
 * Specification: Section 6.3
 */

import type { AIPrompt } from './ai-provider/types.ts';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STEP 2: Hypothesis Generation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export function buildHypothesisPrompt(params: {
  clientName: string;
  industry: string;
  country: string;
  language: string;
  documentContent: string;
  contextSummary?: string;
}): AIPrompt {
  return {
    system: `You are a senior business operations analyst specializing in SME process improvement and automation readiness assessment. You analyze business documents to identify concrete operational bottlenecks that are candidates for AI and automation solutions.

TASK:
Analyze the provided document excerpts from ${params.clientName}, an SME in the ${params.industry} sector in ${params.country}. Identify operational bottlenecks that:
1. Have clear, demonstrable inefficiency (not vague organizational issues)
2. Can plausibly be addressed by AI/automation tools available to an SME
3. Have measurable impact on time, cost, or quality

OUTPUT FORMAT (respond ONLY with valid JSON, no preamble):
{
  "bottlenecks": [
    {
      "id": "b_[sequential_number]",
      "title": "Short descriptive title (max 8 words)",
      "description": "2-3 sentences describing the bottleneck precisely",
      "severity": "low|medium|high",
      "affected_processes": ["process name 1", "process name 2"],
      "automation_potential": "low|medium|high",
      "evidence_basis": "Direct quote or paraphrase from the documents",
      "origin": "ai_generated"
    }
  ],
  "automation_candidates": ["general opportunity 1", "general opportunity 2"]
}

QUALITY CONSTRAINTS:
- Minimum 3 bottlenecks, maximum 8
- Each bottleneck must cite specific evidence from the documents (evidence_basis field)
- Do not generate generic bottlenecks (e.g., "lack of digital tools") — be specific to this SME
- severity='high' requires clear business impact evidence
- Respond in ${params.language}`,
    messages: [
      {
        role: 'user',
        content: params.contextSummary
          ? `Consultant context note: ${params.contextSummary}\n\nDocument excerpts:\n${params.documentContent}`
          : `Document excerpts:\n${params.documentContent}`,
      },
    ],
    max_tokens: 4096,
    temperature: 0.3,
    response_format: 'json',
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STEP 3: Interview Guide Generation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export function buildInterviewPrompt(params: {
  clientName: string;
  industry: string;
  language: string;
  stakeholderRoles: string[];
  bottlenecks: Array<{ id: string; title: string; description: string; severity: string }>;
}): AIPrompt {
  const bottleneckList = params.bottlenecks
    .map((b) => `- [${b.id}] ${b.title} (severity: ${b.severity}): ${b.description}`)
    .join('\n');

  return {
    system: `You are a senior management consultant designing a structured stakeholder interview guide for an SME operational assessment. Your interview guides are precise, targeted, and efficient — each question directly addresses a confirmed operational bottleneck.

TASK:
Generate a comprehensive interview guide for stakeholders at ${params.clientName} targeting the following roles: ${params.stakeholderRoles.join(', ')}.

The guide must cover all provided operational bottlenecks and produce actionable insights.

OUTPUT FORMAT (respond ONLY with valid JSON):
{
  "interview_guide_title": "Interview Guide: [Company Name] Operational Assessment",
  "introduction_script": "Full introduction script the consultant reads to open the interview (2-3 paragraphs)",
  "questions": [
    {
      "id": "q_[sequential_number]",
      "question": "The exact question text",
      "intent": "What this question is designed to uncover",
      "linked_bottleneck_id": "[bottleneck id from list]",
      "expected_answer_type": "qualitative|quantitative|both",
      "sort_order": 1,
      "origin": "ai_generated"
    }
  ],
  "closing_script": "Full closing script (1 paragraph)",
  "estimated_duration_minutes": 60
}

QUALITY CONSTRAINTS:
- Minimum 2 questions per bottleneck, maximum 4
- Questions must be open-ended and non-leading
- Include at least one quantitative question per high-severity bottleneck
- Respond in ${params.language}`,
    messages: [
      {
        role: 'user',
        content: `Operational bottlenecks to address:\n${bottleneckList}`,
      },
    ],
    max_tokens: 6144,
    temperature: 0.4,
    response_format: 'json',
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STEP 5: Gap Analysis
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export function buildGapAnalysisPrompt(params: {
  language: string;
  bottlenecks: Array<{ id: string; title: string; description: string; evidence_basis?: string }>;
  transcriptContent: string;
}): AIPrompt {
  const hypothesisList = params.bottlenecks
    .map((b) => `[${b.id}] ${b.title}: ${b.description}${b.evidence_basis ? ` (Original evidence: ${b.evidence_basis})` : ''}`)
    .join('\n\n');

  return {
    system: `You are a senior management consultant performing a rigorous gap analysis between AI-generated preliminary hypotheses and real-world stakeholder interview findings. Your role is to be the critical bridge between desk research and field reality.

TASK:
Compare the provided AI hypotheses against the interview transcript. For each hypothesis:
1. Determine whether it was confirmed, partially confirmed, or contradicted by the interview
2. Extract specific evidence quotes from the transcript
3. Identify any new bottlenecks discovered that were not in the original hypotheses

CRITICAL RULES:
- Never mark a hypothesis as confirmed unless the transcript contains direct supporting evidence
- The transcript is ground truth. If it contradicts a hypothesis, the hypothesis is wrong
- If a bottleneck is not mentioned in the transcript, mark it as unconfirmed (not confirmed)
- Be precise about evidence — quote or closely paraphrase actual transcript text

OUTPUT FORMAT (respond ONLY with valid JSON):
{
  "gap_findings": [
    {
      "id": "gf_[sequential_number]",
      "bottleneck_id": "[original bottleneck id]",
      "confirmed": true,
      "discrepancy_description": null,
      "evidence_quote": "Exact quote or close paraphrase from transcript",
      "revised_severity": "low|medium|high|eliminated",
      "origin": "ai_generated"
    }
  ],
  "new_bottlenecks": [],
  "overall_alignment_score": 75,
  "analyst_summary": "2-3 paragraph narrative summary of key findings and discrepancies"
}

QUALITY CONSTRAINTS:
- Every gap_finding must have a non-empty evidence_quote
- overall_alignment_score: 0-100 (0 = all hypotheses wrong, 100 = all confirmed)
- new_bottlenecks follow the same schema as the original bottleneck objects
- Respond in ${params.language}`,
    messages: [
      {
        role: 'user',
        content: `Original AI hypotheses:\n${hypothesisList}\n\n${params.transcriptContent}`,
      },
    ],
    max_tokens: 8192,
    temperature: 0.2, // Lower temperature for analytical accuracy
    response_format: 'json',
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STEP 6: Solution Architecture
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export function buildSolutionsPrompt(params: {
  language: string;
  smeProfile: {
    industry: string;
    employee_count: number;
    country: string;
    annual_revenue_eur?: number;
  };
  gapFindings: Array<{
    id: string;
    bottleneck_id: string;
    confirmed: boolean;
    revised_severity: string;
    evidence_quote: string;
  }>;
  bottlenecks: Array<{ id: string; title: string; description: string }>;
}): AIPrompt {
  const confirmedFindings = params.gapFindings.filter((f) => f.confirmed || f.revised_severity !== 'eliminated');
  const findingsList = confirmedFindings
    .map((f) => {
      const bottleneck = params.bottlenecks.find((b) => b.id === f.bottleneck_id);
      return `[${f.id}] Severity: ${f.revised_severity}\nBottleneck: ${bottleneck?.title ?? f.bottleneck_id}\nEvidence: "${f.evidence_quote}"`;
    })
    .join('\n\n');

  return {
    system: `You are a principal AI solutions architect specializing in SME automation. You design practical, cost-effective automation solutions with rigorous ROI analysis. Your solutions are realistic for the client's size, industry, and technical maturity.

CLIENT PROFILE:
- Industry: ${params.smeProfile.industry}
- Employees: ${params.smeProfile.employee_count}
- Country: ${params.smeProfile.country}
${params.smeProfile.annual_revenue_eur ? `- Annual Revenue: ~€${params.smeProfile.annual_revenue_eur.toLocaleString()}` : ''}

TASK:
Design automation solutions for each confirmed gap finding. Each solution must:
1. Target a specific, validated operational bottleneck
2. Recommend appropriate technology stack for an SME of this size
3. Include a fully itemized, assumption-explicit ROI estimate

OUTPUT FORMAT (respond ONLY with valid JSON):
{
  "solutions": [
    {
      "id": "sol_[sequential_number]",
      "title": "Solution title (max 8 words)",
      "description": "2-3 sentences describing the solution and how it addresses the bottleneck",
      "target_bottleneck_id": "[gap finding id]",
      "technology_stack": ["Technology 1", "Technology 2"],
      "implementation_complexity": "low|medium|high",
      "estimated_roi": {
        "time_saved_hours_per_month": 40,
        "cost_reduction_eur_per_year": 12000,
        "payback_period_months": 6,
        "confidence": "low|medium|high",
        "assumptions": ["Assumption 1", "Assumption 2"]
      },
      "included_in_roadmap": true,
      "origin": "ai_generated"
    }
  ],
  "total_estimated_roi_eur_per_year": 50000,
  "implementation_roadmap": [
    {
      "phase": 1,
      "title": "Quick Wins",
      "solution_ids": ["sol_1", "sol_2"],
      "duration_weeks": 8,
      "dependencies": []
    }
  ]
}

QUALITY CONSTRAINTS:
- One solution per confirmed gap finding (may combine closely related findings)
- ROI assumptions must be explicit and specific (e.g., "Assumes €35/hour average labour cost")
- Technology stack must be appropriate for an SME — no enterprise-only solutions
- Payback period must account for implementation cost
- Respond in ${params.language}`,
    messages: [
      {
        role: 'user',
        content: `Confirmed gap findings to address:\n${findingsList}`,
      },
    ],
    max_tokens: 8192,
    temperature: 0.3,
    response_format: 'json',
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STEP 7: Report Generation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export function buildReportPrompt(params: {
  language: string;
  clientName: string;
  consultantName: string;
  industry: string;
  solutions: Array<{ id: string; title: string; description: string; estimated_roi: { cost_reduction_eur_per_year: number } }>;
  gapFindings: Array<{ confirmed: boolean; revised_severity: string; evidence_quote: string }>;
  roadmap: Array<{ phase: number; title: string; duration_weeks: number }>;
  totalRoiEur: number;
  includeAppendix: boolean;
}): AIPrompt {
  const solutionList = params.solutions
    .map((s) => `- ${s.title}: ${s.description} (ROI: €${s.estimated_roi.cost_reduction_eur_per_year.toLocaleString()}/yr)`)
    .join('\n');

  const roadmapText = params.roadmap
    .map((p) => `Phase ${p.phase}: ${p.title} (${p.duration_weeks} weeks)`)
    .join('\n');

  return {
    system: `You are a senior consulting report writer producing a professional AI automation roadmap report for an SME client. The report must be executive-ready, specific, evidence-backed, and written in the consultant's voice.

REPORT RECIPIENT: ${params.clientName} leadership team
PREPARED BY: ${params.consultantName}

OUTPUT FORMAT (respond ONLY with valid JSON):
{
  "executive_summary": "3-4 paragraphs summarizing the engagement, key findings, and recommended approach. Professional, executive-level language.",
  "key_findings": [
    "Finding 1 as a complete sentence",
    "Finding 2 as a complete sentence"
  ],
  "solution_overview": "2-3 paragraphs providing a narrative overview of the recommended solutions and how they address the validated bottlenecks",
  "detailed_roadmap_markdown": "Full implementation roadmap in Markdown format with phases, timelines, and dependencies",
  "total_roi_summary": {
    "total_cost_reduction_eur": ${params.totalRoiEur},
    "total_hours_saved_per_month": 0,
    "top_priority_solution_id": ""
  },
  "export_formats_available": ["pdf"],
  "generated_at": "${new Date().toISOString()}"
}

QUALITY CONSTRAINTS:
- Executive summary must reference specific findings from the engagement
- Key findings must be evidence-backed (reference interview data)
- Roadmap markdown must include a timeline visualization
- All monetary figures in EUR
- Respond entirely in ${params.language} — this is the client's language`,
    messages: [
      {
        role: 'user',
        content: `Industry: ${params.industry}\n\nRecommended solutions:\n${solutionList}\n\nImplementation roadmap:\n${roadmapText}\n\nTotal estimated ROI: €${params.totalRoiEur.toLocaleString()}/year`,
      },
    ],
    max_tokens: 8192,
    temperature: 0.5, // Higher temperature for more varied prose
    response_format: 'json',
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// QUALITY GATE EVALUATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export function buildQualityEvaluationPrompt(params: {
  stepType: string;
  outputContent: string;
}): AIPrompt {
  return {
    system: `You are an AI output quality reviewer for a consulting platform. You score AI-generated consulting content on two dimensions relevant to SME AI consulting engagements.

SCORING DIMENSIONS:
1. PRAGMATISM (0-100): Is the content specific, actionable, and grounded in the provided context?
   Penalize: vague outputs, generic advice, hallucinated specifics, outputs that could apply to any company.
2. ROI_FOCUS (0-100): Does the content maintain clear business value orientation?
   Are impacts quantifiable or at least estimable? Penalize: academic framing, outputs with no connection to time/cost/quality impact.

THRESHOLDS: scores below 60 on either dimension = 'failed'. Both >= 60 = 'passed'.

STEP TYPE BEING EVALUATED: ${params.stepType}

OUTPUT FORMAT (respond ONLY with valid JSON):
{
  "pragmatism_score": 75,
  "roi_focus_score": 80,
  "rationale": "2-3 sentence explanation of the scores",
  "status": "passed"
}`,
    messages: [
      {
        role: 'user',
        content: `Content to evaluate:\n${params.outputContent.slice(0, 8000)}`,
      },
    ],
    max_tokens: 512,
    temperature: 0.1, // Very low for consistent scoring
    response_format: 'json',
  };
}
