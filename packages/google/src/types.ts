export interface GoogleTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
}

export interface GmailFetchOptions {
  maxResults?: number;
  hoursBack?: number;
  query?: string;
}

export interface CalendarFetchOptions {
  date?: Date;
  maxResults?: number;
}
