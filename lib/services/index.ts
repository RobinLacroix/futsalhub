// Export centralisé de tous les services
export { playersService } from './playersService';
export { matchesService } from './matchesService';
export { trainingsService } from './trainingsService';
export { teamsService } from './teamsService';
export { matchEventsService } from './matchEventsService';
export { schematicsService } from './schematicsService';
export {
  createTokensForTraining,
  getFeedbackSessionByToken,
  submitTrainingFeedback,
  getFeedbackLinksForTraining,
  getPlayerTrainingFeedback
} from './trainingFeedbackService';
export type { PlayerTrainingFeedbackRow } from './trainingFeedbackService';
export {
  getMyConvocations,
  setMyTrainingAttendance,
  getMyPendingFeedbackTokens,
  createPlayerLinkCode,
  claimPlayerLinkCode
} from './playerConvocationsService';
export type { MyConvolutionRow, MyPendingFeedbackRow } from './playerConvocationsService';

