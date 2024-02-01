export class OnlyRunLatestJob {
  private latestJob: (() => Promise<void>) | null = null;
  private jobsAreRunning: boolean = false;

  constructor () {}

  public submitJob(job: () => Promise<void>): void  {
    // if (this.latestJob) {
    //   console.log('overwriting job');
    // }
    this.latestJob = job;
    if (!this.jobsAreRunning) {
      setImmediate(() => this.runJobs());
    }
  }

  private async runJobs() {
    if (this.jobsAreRunning) { return; }
    this.jobsAreRunning = true;
    while (this.latestJob) {
      const job = this.latestJob;
      this.latestJob = null;
      await job();
    }
    this.jobsAreRunning = false;
  }
}
