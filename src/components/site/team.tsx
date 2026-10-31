type Member = {
  name: string;
  role: string;
  education: string;
  bio: string;
  expertise: string[];
  photo?: string;
  linkedin?: string;
};

const TEAM: Member[] = [
  {
    name: "Harshveer",
    role: "Frontend Development & Systems Integration",
    education: "Systems Automation Engineering Technology, McMaster University",
    bio: "Harshveer focuses on PEAKFIVE's frontend development, system integration, and user experience. His work includes developing the interactive dashboard, connecting external data services, and integrating the website with the Python optimization backend to transform complex engineering calculations into accessible visualizations.",
    expertise: [
      "Frontend Development",
      "API Integration",
      "Systems Automation",
      "Data Visualization",
    ],
  },
  {
    name: "Harshith",
    role: "Backend Development & Optimization",
    education: "Systems Automation Engineering Technology, McMaster University",
    bio: "Harshith leads the development of PEAKFIVE's backend optimization engine, focusing on mathematical modelling, intelligent pump scheduling, and operational constraints. His work involves implementing Python-based optimization algorithms that support efficient electricity management while maintaining modelled water-system requirements.",
    expertise: [
      "Python Development",
      "Mathematical Optimization",
      "Backend Engineering",
      "Systems Automation",
    ],
  },
  {
    name: "Kampan Ananthamoorthy",
    role: "Business Strategy & Commercialization",
    education: "Mechatronics Engineering | MBA",
    bio: "Kampan Ananthamoorthy brings a combination of engineering knowledge and business strategy to PEAKFIVE. With a background in Mechatronics Engineering and MBA studies, he focuses on market research, commercial feasibility, competitive analysis, and business-model development. His work helps connect PEAKFIVE's technical capabilities with potential opportunities in the municipal water and energy sectors.",
    expertise: [
      "Business Strategy",
      "Market Research",
      "Commercialization",
      "Mechatronics Engineering",
    ],
  },
];

export function TeamSection() {
  return (
    <div>
      <h2 className="text-3xl font-semibold">Meet the Team Behind PEAKFIVE</h2>
      <p className="mt-3 max-w-3xl text-muted-foreground">
        Bringing together expertise in systems automation, software development, engineering, and
        business strategy to build smarter solutions for sustainable infrastructure.
      </p>
      <div className="mt-8 grid gap-5 md:grid-cols-3">
        {TEAM.map((m, i) => (
          <article
            key={m.name}
            className="flex flex-col rounded-lg border border-border bg-card p-6 transition duration-300 hover:-translate-y-1 hover:border-primary/60 hover:shadow-lg motion-reduce:transition-none motion-reduce:hover:translate-y-0"
          >
            <div className="flex items-center gap-3">
              {m.photo ? (
                <img src={m.photo} alt={m.name} className="h-12 w-12 rounded-full object-cover" />
              ) : (
                <span className="num text-primary">0{i + 1}</span>
              )}
            </div>
            <h3 className="mt-4 text-lg font-semibold">{m.name}</h3>
            <p className="text-sm text-primary">{m.role}</p>
            <p className="mt-1 text-xs text-muted-foreground">{m.education}</p>
            <p className="mt-4 flex-1 text-sm leading-relaxed text-muted-foreground">{m.bio}</p>
            <ul className="mt-5 flex flex-wrap gap-2">
              {m.expertise.map((e) => (
                <li
                  key={e}
                  className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs text-primary"
                >
                  {e}
                </li>
              ))}
            </ul>
            {m.linkedin && (
              <a
                href={m.linkedin}
                target="_blank"
                rel="noreferrer"
                className="mt-4 text-sm text-primary"
              >
                LinkedIn →
              </a>
            )}
          </article>
        ))}
      </div>
      <div className="mt-10 rounded-lg border border-border p-6">
        <h3 className="text-lg font-semibold">Built at McMaster University</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Developed for P2P Hacks 2026, PEAKFIVE combines engineering innovation with business
          strategy to explore practical solutions for energy-efficient municipal water
          infrastructure.
        </p>
      </div>
    </div>
  );
}
