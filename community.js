// The VEYA Collective: everyone on the mailing list is a member, with a member number that's
// theirs for good, and members vote on what VEYA makes next.

const FOUNDING_MEMBERS = 1000; // the first 1,000 members are Founding Members

// The members' vote. For a new vote, change the question and options and give it a new `id`, so
// every member gets a fresh vote (the old results stay in the database under the old id).
const POLL = {
  id: 'next-drop-1',
  question: 'What should we make next?',
  options: [
    { id: 'beanie', name: 'Ribbed Beanie', note: 'A chunky rib-knit beanie with a small embroidered VEYA.' },
    { id: 'cap', name: 'Washed Dad Cap', note: 'Soft washed cotton, low profile, in the VEYA colours.' },
    { id: 'socks', name: 'Heavyweight Crew Socks', note: 'Thick ribbed socks to finish every sweat set.' },
    { id: 'tote', name: 'Canvas Tote', note: 'A heavy canvas tote for the everyday carry.' },
  ],
};

// A member's public details. Numbers are the order people joined in: No. 0001 was first.
function member(row) {
  return { number: String(row.id).padStart(4, '0'), founding: row.id <= FOUNDING_MEMBERS, since: row.created_at };
}

// Vote counts as percentages that add up to exactly 100 (largest remainder first).
function tally(poll, counts) {
  const votes = Object.fromEntries(counts.map((c) => [c.option, c.n]));
  const total = poll.options.reduce((sum, o) => sum + (votes[o.id] || 0), 0);
  const rows = poll.options.map((o, i) => {
    const exact = total ? ((votes[o.id] || 0) * 100) / total : 0;
    return { id: o.id, votes: votes[o.id] || 0, percent: Math.floor(exact), remainder: exact % 1, i };
  });
  let left = total ? 100 - rows.reduce((sum, r) => sum + r.percent, 0) : 0;
  [...rows].sort((a, b) => b.remainder - a.remainder || a.i - b.i).forEach((r) => {
    if (left > 0 && r.remainder > 0) { r.percent += 1; left -= 1; }
  });
  return { total, options: rows.map(({ id, votes: n, percent }) => ({ id, votes: n, percent })) };
}

module.exports = { FOUNDING_MEMBERS, POLL, member, tally };
