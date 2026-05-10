import cron from "node-cron";

const JOB_NAME = "EXAMPLE_JOB";
let isRunning = false;

export default function exampleJob() {

  return;

  cron.schedule(
    "* * * * * *", // every second adjust the schedule as needed
    async () => {
      if (isRunning) {
        console.warn(`${JOB_NAME} - Already running. Skipping this iteration.`);
        return;
      }

      isRunning = true;
      console.log(`${JOB_NAME} - Started.`);

      await new Promise((resolve) => setTimeout(resolve, 5000)); // simulate 5 seconds of work

      isRunning = false;
      console.log(`${JOB_NAME} - Finished.`);

      return;
    },
  );
}
