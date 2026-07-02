export function run(input) {
  const data = typeof input === 'string' ? { task: input } : (input && typeof input === 'object' ? input : null);
  if (!data) throw new Error('input must be a string or an object with a "task" field');
  const task = typeof data.task === 'string' ? data.task.trim() : '';
  if (!task) throw new Error('missing required field: task');

  const clean = (v) => (typeof v === 'string' ? v.trim() : '');
  const role = clean(data.role);
  const tone = clean(data.tone);
  const audience = clean(data.audience);
  const format = clean(data.format);
  const language = clean(data.language);
  const constraints = Array.isArray(data.constraints) ? data.constraints.map(clean).filter(Boolean) : [];
  const examples = Array.isArray(data.examples) ? data.examples.map(clean).filter(Boolean) : [];

  const lines = [];
  lines.push(role ? ('You are ' + role + '.') : 'You are an expert assistant.');
  if (audience) lines.push('Your audience is ' + audience + '.');
  lines.push('');
  lines.push('# Task');
  lines.push(task);

  const rules = [];
  if (tone) rules.push('Use a ' + tone + ' tone.');
  if (language) rules.push('Write the response in ' + language + '.');
  if (format) rules.push('Format the output as ' + format + '.');
  for (const c of constraints) rules.push(c);
  rules.push('Be clear, concise and complete.');
  rules.push('If information is missing, state your assumptions instead of inventing facts.');

  lines.push('');
  lines.push('# Constraints');
  for (let i = 0; i < rules.length; i++) lines.push('- ' + rules[i]);

  if (examples.length) {
    lines.push('');
    lines.push('# Examples');
    for (let i = 0; i < examples.length; i++) lines.push((i + 1) + '. ' + examples[i]);
  }

  lines.push('');
  lines.push('# Output');
  lines.push(format ? ('Return the answer as ' + format + '.') : 'Return a well-structured answer.');

  const prompt = lines.join('\n');
  const wordCount = task.split(/\s+/).filter(Boolean).length;

  return {
    prompt,
    sections: {
      role: role || 'You are an expert assistant.',
      task,
      constraints: rules,
      examples,
      output: format || 'well-structured answer'
    },
    meta: {
      taskWordCount: wordCount,
      constraintCount: rules.length,
      hasExamples: examples.length > 0,
      length: prompt.length
    }
  };
}
