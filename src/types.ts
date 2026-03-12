export interface ReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

export interface GitHubRelease {
  tag_name: string;
  name: string | null;
  body: string | null;
  assets: ReleaseAsset[];
}

export interface BuildInfo {
  version: string;
  commit: string;
  dirty: boolean;
  commit_date: string | null;
}
