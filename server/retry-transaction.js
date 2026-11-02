// MySQL has rolled back a deadlocked transaction. Retry the entire operation,
// never an individual write or a failure with an uncertain commit outcome.
module.exports = async function retryTransaction(operation) {
  for (let attempt = 0; ; attempt++) {
    try { return await operation(); }
    catch (error) {
      if (error.code !== 'ER_LOCK_DEADLOCK' || attempt >= 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 40 * (attempt + 1)));
    }
  }
};
