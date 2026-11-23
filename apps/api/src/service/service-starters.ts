// Modified by Agental: new file in the Agental white-label of Rakazo (Apache-2.0, see NOTICE).

export const PROJECT_TYPES = ["startup", "store", "academy"] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];

export type StarterBot = { key: "operator" | "leads" | "content"; name: string; about: string };

/** The three bots every provisioned Space starts with. */
export const STARTER_BOTS: readonly StarterBot[] = [
  {
    key: "operator",
    name: "Operator",
    about:
      "You run this project's board. Pick up the tickets assigned to you, do the work, and move each ticket as you go. Before any step that spends money, sends something outside the team, or cannot be undone, stop and ask. When a ticket needs the owner's decision, move it to review and say what you need.",
  },
  {
    key: "leads",
    name: "Leads",
    about:
      "You find people who match this project's customer and draft a first message for each. Give the reason each lead fits. Never contact anyone yourself: hand the list and the drafts to the owner.",
  },
  {
    key: "content",
    name: "Content",
    about:
      "You draft posts, pages and emails in the owner's voice for them to review. Nothing is published until the owner approves it. Put links in the first comment, not in the post.",
  },
];

type StarterRoutine = { bot: StarterBot["key"]; name: string; prompt: string; cron: string };

const WEEKLY_PLAN: StarterRoutine = {
  bot: "operator",
  name: "Weekly plan",
  prompt:
    "Review the board. List what was finished last week, what is blocked and why, and propose the three most useful tickets for this week. Ask before starting any of them.",
  cron: "0 9 * * 1",
};

/** Starter routines per project type. Each is created paused: the owner switches it on. */
export const STARTER_ROUTINES: Record<ProjectType, readonly StarterRoutine[]> = {
  startup: [
    WEEKLY_PLAN,
    {
      bot: "leads",
      name: "Weekly leads",
      prompt:
        "Find up to 50 people who match the target customer in the product spec, with the reason each one fits and a short first message. Hand the list to the owner.",
      cron: "0 10 * * 1",
    },
    {
      bot: "content",
      name: "Weekly posts",
      prompt:
        "Draft up to 15 posts for the week about the product and what was shipped, for the owner to review. Links go in the first comment.",
      cron: "0 10 * * 2",
    },
  ],
  store: [
    WEEKLY_PLAN,
    {
      bot: "leads",
      name: "Weekly wholesale and creator leads",
      prompt:
        "Find up to 50 shops or creators who could sell or feature the products in the catalog, with the reason each one fits and a short first message. Hand the list to the owner.",
      cron: "0 10 * * 1",
    },
    {
      bot: "content",
      name: "Weekly product posts",
      prompt:
        "Draft up to 15 product posts for the week from the catalog and brand brief, for the owner to review. Links go in the first comment.",
      cron: "0 10 * * 2",
    },
  ],
  academy: [
    WEEKLY_PLAN,
    {
      bot: "leads",
      name: "Weekly student leads",
      prompt:
        "Find up to 50 people who match the student profile in the curriculum outline, with the reason each one fits and a short invitation. Hand the list to the owner.",
      cron: "0 10 * * 1",
    },
    {
      bot: "content",
      name: "Weekly lesson posts",
      prompt:
        "Draft up to 15 posts for the week, each teaching one idea from the course plan, for the owner to review. Links go in the first comment.",
      cron: "0 10 * * 2",
    },
  ],
};
