/**
 * Shared AI prompt templates
 */

export interface PromptOptions {
  providerHints?: string;
  additionalTags?: {
    subject: string;
    tags: string[];
  }[];
  customTemplate?: string;
  prefetchedMathTags?: string[];
  prefetchedPhysicsTags?: string[];
  prefetchedChemistryTags?: string[];
  prefetchedBiologyTags?: string[];
  prefetchedEnglishTags?: string[];
}

export interface SimilarQuestionPromptContext {
  gradeSemester?: string | null;
  mistakeWhyWrong?: string | null;
  confirmedRootCause?: string | null;
}

function replaceVariables(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key) => variables[key] || '');
}

export function getMathTagsForGrade(
  grade: 7 | 8 | 9 | 10 | 11 | 12 | null,
  prefetchedTags?: string[]
): string[] {
  void grade;
  if (prefetchedTags && prefetchedTags.length > 0) {
    return prefetchedTags;
  }
  console.warn('[prompts] No prefetched tags provided, AI will tag freely');
  return [];
}

export const DEFAULT_ANALYZE_TEMPLATE = `You are a K12 math analysis assistant.
{{language_instruction}}

Output ONLY with these tags:
<subject>数学</subject>
<knowledge_points>comma-separated tags</knowledge_points>
<requires_image>true|false</requires_image>
<question_text>problem text</question_text>
<answer_text>final answer</answer_text>
<analysis>short explanation</analysis>
<solution_final_answer>one-line answer</solution_final_answer>
<solution_steps>one step per line</solution_steps>
<mistake_student_steps>one step per line</mistake_student_steps>
<mistake_wrong_step_index>1-based index or empty</mistake_wrong_step_index>
<mistake_why_wrong>short reason</mistake_why_wrong>
<mistake_fix_suggestion>how to fix</mistake_fix_suggestion>

Available tags:
{{knowledge_points_list}}
{{subject_hint}}
{{provider_hints}}`;

export const DEFAULT_SIMILAR_TEMPLATE = `You are a K12 math question generator.
{{language_instruction}}
DIFFICULTY LEVEL: {{difficulty_level}}
{{difficulty_instruction}}

Original Question: {{original_question}}
Knowledge Points: {{knowledge_points}}
Grade/Semester Context: {{grade_context}}
Mistake Context (H): {{mistake_context}}
Student Confirmed Root Cause (I): {{root_cause_context}}

Rules:
1) Keep math subject only.
2) Keep target knowledge points aligned.
3) If root cause is provided, design the new question to target that weakness.
4) Keep output concise and exam-style.
5) Keep question_text to 1-3 lines; avoid verbose wording.
6) Keep answer_text as a short final answer only.
7) Keep analysis to 2-4 short sentences; no long derivation.
8) Prefer simple math notation; avoid \\left and \\right.

Output ONLY:
<question_text>new question</question_text>
<answer_text>answer</answer_text>
<analysis>short analysis</analysis>
{{provider_hints}}`;

export const DEFAULT_REANSWER_TEMPLATE = `You are a professional math teacher.
{{language_instruction}}

Question:
{{question_text}}

Subject hint:
{{subject_hint}}

Rules:
1) Subject is fixed to Math.
2) analysis must be a short teaching summary (2-4 sentences).
3) Put detailed derivation in <solution_steps>.
4) In <solution_steps> and <mistake_student_steps>, each step must be a complete line.
5) Do NOT output a standalone numbering line like "1.".

Output ONLY:
<answer_text>answer</answer_text>
<analysis>analysis</analysis>
<knowledge_points>comma-separated tags</knowledge_points>
<solution_final_answer>one-line answer</solution_final_answer>
<solution_steps>one complete step per line</solution_steps>
<mistake_student_steps>one complete step per line</mistake_student_steps>
<mistake_wrong_step_index>1-based index or empty</mistake_wrong_step_index>
<mistake_why_wrong>short reason</mistake_why_wrong>
<mistake_fix_suggestion>how to fix</mistake_fix_suggestion>
{{provider_hints}}`;

export function generateAnalyzePrompt(
  language: 'zh' | 'en',
  grade?: 7 | 8 | 9 | 10 | 11 | 12 | null,
  subject?: string | null,
  options?: PromptOptions
): string {
  const langInstruction = language === 'zh'
    ? '请使用中文。Use Chinese for analysis. Keep question/answer in original question language. (Chinese mode)'
    : 'Please ensure all analysis text is in English. (English mode)';

  const mathTags = getMathTagsForGrade(grade || null, options?.prefetchedMathTags);
  const mathTagsString = mathTags.length > 0 ? mathTags.map((tag) => `"${tag}"`).join(', ') : '(no predefined tags)';

  let tagsSection = `Math tags: ${mathTagsString}`;
  if (subject) {
    tagsSection = `Subject: ${subject}\n${tagsSection}`;
  }

  const template = options?.customTemplate || DEFAULT_ANALYZE_TEMPLATE;

  return replaceVariables(template, {
    language_instruction: langInstruction,
    knowledge_points_list: tagsSection,
    subject_hint: subject ? `Current subject hint: ${subject}` : '',
    provider_hints: options?.providerHints || '',
  }).trim();
}

export function generateSimilarQuestionPrompt(
  language: 'zh' | 'en',
  originalQuestion: string,
  knowledgePoints: string[],
  difficulty: 'easy' | 'medium' | 'hard' | 'harder' = 'medium',
  options?: PromptOptions,
  context?: SimilarQuestionPromptContext
): string {
  const langInstruction = language === 'zh'
    ? '请使用中文。Please output in Chinese when possible. (Chinese)'
    : 'Please output in English. (English)';

  const difficultyInstruction = {
    easy: 'Make it easier than the original.',
    medium: 'Keep similar difficulty.',
    hard: 'Make it harder than the original.',
    harder: 'Make it much harder than the original.',
  }[difficulty];

  const template = options?.customTemplate || DEFAULT_SIMILAR_TEMPLATE;
  const normalizeContext = (value: string | null | undefined, fallback: string): string => {
    const trimmed = (value || "").trim();
    if (!trimmed) return fallback;
    return trimmed.replace(/\r?\n/g, " ").slice(0, 300);
  };

  return replaceVariables(template, {
    language_instruction: langInstruction,
    difficulty_level: difficulty.toUpperCase(),
    difficulty_instruction: difficultyInstruction,
    original_question: originalQuestion.replace(/"/g, '\\"').replace(/\n/g, '\\n'),
    knowledge_points: knowledgePoints.length > 0 ? knowledgePoints.join(', ') : '(none)',
    grade_context: normalizeContext(context?.gradeSemester, '(not provided)'),
    mistake_context: normalizeContext(context?.mistakeWhyWrong, '(not provided)'),
    root_cause_context: normalizeContext(context?.confirmedRootCause, '(not provided)'),
    provider_hints: options?.providerHints || '',
  }).trim();
}

export function generateReanswerPrompt(
  language: 'zh' | 'en',
  questionText: string,
  subject?: string | null,
  options?: PromptOptions
): string {
  const langInstruction = language === 'zh'
    ? '请使用中文。Please provide analysis in Chinese. (Chinese)'
    : 'Please provide analysis in English. (English)';

  const subjectHint = subject
    ? `Subject: ${subject}`
    : 'Subject: math';

  const template = options?.customTemplate || DEFAULT_REANSWER_TEMPLATE;

  return replaceVariables(template, {
    language_instruction: langInstruction,
    question_text: questionText,
    subject_hint: subjectHint,
    provider_hints: options?.providerHints || '',
  }).trim();
}

export const DEFAULT_EXTRACT_TEMPLATE = `You are a math image extraction assistant.
Task: extract only the textual math problem and optional student working steps from the image.
Do not solve the problem.
Do not output JSON or markdown code fences.
Classify question font size using three levels:
- large: printed question text is visibly larger than typical exam text.
- normal: common exam/homework text size.
- small: text is visibly dense or smaller than typical exam text.
If uncertain, output normal.

Output strictly with these tags only:
<requires_image>
true or false
</requires_image>

<question_text>
Full original problem text. Keep original language. Use Markdown + LaTeX when needed.
</question_text>

<question_font_size_hint>
small | normal | large
</question_font_size_hint>

<student_steps_raw>
Optional. Student-written steps, one step per line. Leave empty if unavailable.
</student_steps_raw>
{{provider_hints}}`;

export const DEFAULT_REASON_TEMPLATE = `You are a math tutor focused on concise, structured diagnosis.
You are given the extracted problem text and optional student steps.

Rules:
1) Subject is fixed to Math. Do not classify subject.
2) analysis must be a short teaching summary (2-4 sentences), not full derivation.
3) Put detailed derivation in <solution_steps> only.
4) knowledge_points must be selected from the available tag list when possible.
5) Max 5 knowledge points.
6) Output only XML-like tags. No JSON. No code fences.

Question:
{{question_text}}

Student steps (optional):
{{student_steps}}

Available math tags:
{{knowledge_points_list}}

Output tags:
<answer_text>
Final answer.
</answer_text>

<analysis>
Short explanation for student.
</analysis>

<knowledge_points>
Comma-separated tags.
</knowledge_points>

<solution_final_answer>
One-line final answer.
</solution_final_answer>

<solution_steps>
Detailed standard solution, one step per line.
</solution_steps>

<mistake_student_steps>
Recovered student steps, one step per line.
</mistake_student_steps>

<mistake_wrong_step_index>
1-based index of first wrong step. Empty if unknown.
</mistake_wrong_step_index>

<mistake_why_wrong>
Why that step is wrong.
</mistake_why_wrong>

<mistake_fix_suggestion>
How to fix that step.
</mistake_fix_suggestion>
{{provider_hints}}`;

export function generateExtractPrompt(
  language: 'zh' | 'en',
  options?: PromptOptions
): string {
  const providerHints = options?.providerHints || '';
  const languageHint = language === 'zh'
    ? 'Keep extracted text in original language; do not translate.'
    : 'Keep extracted text in original language; do not translate.';

  return `${DEFAULT_EXTRACT_TEMPLATE}\n${languageHint}`
    .replace('{{provider_hints}}', providerHints)
    .trim();
}

export function generateReasonPrompt(
  language: 'zh' | 'en',
  questionText: string,
  studentStepsRaw: string[],
  grade?: 7 | 8 | 9 | 10 | 11 | 12 | null,
  options?: PromptOptions
): string {
  const mathTags = getMathTagsForGrade(grade || null, options?.prefetchedMathTags);
  const tagsString = mathTags.length > 0
    ? mathTags.map((tag) => `"${tag}"`).join(', ')
    : '(no predefined tags)';

  const studentSteps = studentStepsRaw.length > 0
    ? studentStepsRaw.join('\n')
    : '(none)';

  const languageRule = language === 'zh'
    ? 'Use Simplified Chinese for analysis and mistake explanations.'
    : 'Use English for analysis and mistake explanations.';

  const template = options?.customTemplate || DEFAULT_REASON_TEMPLATE;

  return replaceVariables(template, {
    question_text: questionText,
    student_steps: studentSteps,
    knowledge_points_list: tagsString,
    provider_hints: options?.providerHints || ''
  })
    .concat(`\n${languageRule}`)
    .trim();
}
