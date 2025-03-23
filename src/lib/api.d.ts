declare module '../lib/api.js' {
  export function getHighscores(): Promise<Array<{
    name: string;
    score: number;
    _id?: string;
    createdAt?: string;
  }>>;

  export function saveHighscore(score: { name: string; score: number }): Promise<Array<{
    name: string;
    score: number;
    _id?: string;
    createdAt?: string;
  }>>;
}
