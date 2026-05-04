'use strict';

/**
 * Claude integration layer for ScholarPath.
 *
 * Uses claude-sonnet-4-6 for outreach drafting, college fit explanations, and
 * interview evaluation. Stable content (system prompt + athlete profile JSON)
 * is cached via cache_control: {type: 'ephemeral'}; volatile content (the
 * specific question / target school) lives after the cache breakpoint.
 *
 * Falls back to deterministic templates when ANTHROPIC_API_KEY is not set, so
 * the platform stays runnable without API credentials.
 */

const MODEL = 'claude-sonnet-4-6';
const KEY = process.env.ANTHROPIC_API_KEY;

let client = null;
if (KEY) {
  try {
    const Anthropic = require('@anthropic-ai/sdk').default;
    client = new Anthropic({ apiKey: KEY });
  } catch (e) {
    console.warn('[ai] failed to load @anthropic-ai/sdk:', e.message);
  }
}

const ENABLED = !!client;

const SYSTEM_OUTREACH = `You are a recruiting writing coach for high school student-athletes drafting their first outreach to college coaches.

Your job is to draft a single, concise, professional introductory email — under 180 words — that the athlete will edit and send themselves. Never auto-send. Never embellish credentials. Use only the verified data in the athlete profile.

Required structure:
1. Subject line: graduation year + position + name + headline metric
2. Greeting (Coach LastName)
3. One sentence introducing the athlete with school, position, height, weight, and GPA
4. One sentence stating a *specific*, *truthful* reason for interest in this program
5. One sentence pointing to the profile, film, and a coach reference
6. One sentence with a concrete next step (event, visit, schedule)
7. Sign-off

Strict rules:
- Plain text only. No markdown, no emoji, no exclamation marks beyond the closing.
- Never invent stats, awards, or coaches. If a field is missing, omit it.
- Tone: respectful, direct, and uncomplicated. The athlete writes this — not a publicist.
- Do not promise outcomes ("would love to play for you", "I will commit").
- End with the athlete's name, class year, school, and phone number.

Return JSON only, with keys: subject, body, tips (array of 3 short edit suggestions for the athlete).`;

const SYSTEM_FIT = `You are a college recruiting analyst writing concise, honest fit explanations for high school student-athletes considering specific colleges.

Given an athlete profile and a target school, write a 3-paragraph explanation:

Paragraph 1 — Athletic fit (3 sentences): division level alignment, position need, and a candid read on playing-time projection.
Paragraph 2 — Academic & financial fit (3 sentences): GPA vs. admit average, intended major availability, and net-cost realism.
Paragraph 3 — Honest verdict (2 sentences): "Likely / Target / Reach" classification with the single biggest variable that would change it.

Strict rules:
- Plain text. No headers, no bullets, no marketing language.
- Never promise admission or an offer.
- If the school is a poor fit, say so plainly.
- Stay under 220 words total.`;

const SYSTEM_INTERVIEW = `You are an evaluator for high school student-athletes practicing recruiting interviews with college coaches.

You will receive (a) the question the athlete was asked and (b) the athlete's spoken answer (transcribed). Score the answer on three dimensions, each 0–10:

- clarity: structure, pacing, and ease of understanding
- content: did they answer the question, with specific examples and concrete numbers where appropriate
- confidence: composure, ownership, lack of filler ("um", "like", "you know")

Then provide:
- one_strength: a single sentence on what was best
- one_growth: a single sentence on the most important fix
- rewrite: a 60–90 word version of the answer the athlete could rehearse next

Return strict JSON with keys: clarity, content, confidence, overall (average rounded to one decimal), one_strength, one_growth, rewrite.`;

function fmtAthleteProfile(athlete, eligibility, stats, films) {
  return JSON.stringify({
    name: athlete.full_name,
    grad_year: athlete.grad_year,
    sport: athlete.sport,
    position: athlete.position,
    height_in: athlete.height_in,
    weight_lb: athlete.weight_lb,
    school: athlete.school_name,
    state: athlete.state,
    gpa: athlete.gpa,
    intended_majors: athlete.intended_majors,
    eligibility_stoplight: eligibility?.stoplight,
    projected_gpa: eligibility?.projected_year_end_gpa,
    core_complete: eligibility?.total_core_completed,
    verified_film_count: films?.filter(f => f.verified_by).length || 0,
    verified_stats: (stats || []).filter(s => s.source !== 'self').map(s => ({ metric: s.metric, value: s.value, unit: s.unit, source: s.source })),
  }, null, 2);
}

async function draftOutreach({ athlete, eligibility, stats, films, school }) {
  if (!ENABLED) {
    return {
      generated_with: 'template-v1',
      subject: `${athlete.grad_year} ${athlete.position} — ${athlete.full_name} | GPA ${athlete.gpa ?? 'N/A'}`,
      body: `Coach,\n\nMy name is ${athlete.full_name}, a ${athlete.grad_year} ${athlete.position || athlete.sport} at ${athlete.school_name}. I am ${Math.floor((athlete.height_in||0)/12)}'${(athlete.height_in||0)%12}", ${athlete.weight_lb} lbs, with a ${athlete.gpa} GPA.\n\nI am interested in ${school.name} because of your program's commitment to developing ${athlete.sport} players and the academic strength of your ${athlete.intended_majors || 'undergraduate'} program.\n\nMy profile, verified film, and coach reference are linked. I would welcome the chance to learn more about your program.\n\nSincerely,\n${athlete.full_name}\nClass of ${athlete.grad_year}`,
      tips: [
        'Replace the school sentence with one specific, truthful reason you are interested in this program.',
        'Add a sentence about your most recent verified game or showcase.',
        'Close with a concrete next step (event you will attend, visit you can schedule).',
      ],
    };
  }

  const profileJSON = fmtAthleteProfile(athlete, eligibility, stats, films);

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    thinking: { type: 'disabled' },
    output_config: { effort: 'low' },
    system: [
      { type: 'text', text: SYSTEM_OUTREACH },
      { type: 'text', text: `Athlete profile (verified data):\n${profileJSON}`, cache_control: { type: 'ephemeral' } },
    ],
    messages: [{
      role: 'user',
      content: `Draft an introductory email for this athlete to ${school.name} (${school.division || 'college'}, ${school.state || ''}). Return JSON only.`,
    }],
  });

  const text = response.content.find(b => b.type === 'text')?.text || '';
  const cleaned = text.replace(/^```json\s*/, '').replace(/```\s*$/, '').trim();

  try {
    const parsed = JSON.parse(cleaned);
    return {
      generated_with: 'claude-sonnet-4-6',
      cache_read_tokens: response.usage?.cache_read_input_tokens || 0,
      cache_write_tokens: response.usage?.cache_creation_input_tokens || 0,
      ...parsed,
    };
  } catch (e) {
    return { generated_with: 'claude-sonnet-4-6-raw', body: text, tips: [] };
  }
}

async function explainFit({ athlete, eligibility, stats, films, school, fitScore }) {
  if (!ENABLED) {
    const tier = fitScore >= 85 ? 'Likely' : fitScore >= 72 ? 'Target' : 'Reach';
    return {
      generated_with: 'template-v1',
      tier,
      explanation: `${school.name} is a ${tier} fit. Your GPA (${athlete.gpa}) is ${athlete.gpa >= (school.avg_admit_gpa - 0.2) ? 'in range' : 'below average'} for admits, and the program ${(school.position_needs || []).includes(athlete.position) ? 'has a stated need' : 'does not currently list a need'} at ${athlete.position}. Net cost is estimated at $${school.estimated_net_cost?.toLocaleString() || 'unknown'}/yr.`,
    };
  }

  const profileJSON = fmtAthleteProfile(athlete, eligibility, stats, films);
  const schoolJSON = JSON.stringify(school, null, 2);

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 800,
    thinking: { type: 'disabled' },
    output_config: { effort: 'low' },
    system: [
      { type: 'text', text: SYSTEM_FIT },
      { type: 'text', text: `Athlete profile:\n${profileJSON}`, cache_control: { type: 'ephemeral' } },
    ],
    messages: [{
      role: 'user',
      content: `Target school:\n${schoolJSON}\n\nFit score (computed by our matching engine): ${fitScore}/100. Write the 3-paragraph explanation.`,
    }],
  });

  const text = response.content.find(b => b.type === 'text')?.text || '';
  return {
    generated_with: 'claude-sonnet-4-6',
    cache_read_tokens: response.usage?.cache_read_input_tokens || 0,
    explanation: text,
  };
}

async function evaluateInterview({ question, transcript }) {
  if (!ENABLED) {
    const wc = transcript.split(/\s+/).length;
    const fillers = (transcript.match(/\b(um|uh|like|you know|so)\b/gi) || []).length;
    const clarity = Math.max(2, Math.min(10, 8 - Math.floor(fillers / 3)));
    const content = wc >= 60 ? 8 : wc >= 30 ? 6 : 4;
    const confidence = Math.max(2, Math.min(10, 9 - fillers));
    return {
      generated_with: 'template-v1',
      clarity, content, confidence,
      overall: +((clarity + content + confidence) / 3).toFixed(1),
      one_strength: 'You answered the question directly and stayed on topic.',
      one_growth: fillers > 4 ? `Reduce filler words ("um", "like") — counted ${fillers} in your answer.` : 'Add one specific example with a number to make the answer more concrete.',
      rewrite: 'When a coach asks this, lead with one sentence that answers the question, then give one specific example with a metric, then close with what you took away from it.',
    };
  }

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 600,
    thinking: { type: 'disabled' },
    output_config: { effort: 'low' },
    system: [{ type: 'text', text: SYSTEM_INTERVIEW, cache_control: { type: 'ephemeral' } }],
    messages: [{
      role: 'user',
      content: `Question: ${question}\n\nAthlete's spoken answer (transcribed):\n${transcript}\n\nReturn strict JSON.`,
    }],
  });

  const text = response.content.find(b => b.type === 'text')?.text || '';
  const cleaned = text.replace(/^```json\s*/, '').replace(/```\s*$/, '').trim();
  try {
    return { generated_with: 'claude-sonnet-4-6', cache_read_tokens: response.usage?.cache_read_input_tokens || 0, ...JSON.parse(cleaned) };
  } catch (e) {
    return { generated_with: 'claude-sonnet-4-6-raw', raw: text };
  }
}

module.exports = {
  enabled: ENABLED,
  model: MODEL,
  draftOutreach,
  explainFit,
  evaluateInterview,
};
