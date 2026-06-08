export const SOURCE_LABELS: Record<string, string> = {
  weworkremotely: 'We Work Remotely',
  workingnomads: 'Working Nomads',
  remote_co: 'Remote.co',
  nodesk: 'NoDesk',
  remote100k: 'Remote 100K',
  skipthedrive: 'Skip The Drive',
  justremote: 'JustRemote',
  topstartups: 'Top Startups',
  wellfound: 'Wellfound',
  crunchbase: 'Crunchbase',
};

export const ALL_SOURCES = Object.keys(SOURCE_LABELS);

export function getSourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}
