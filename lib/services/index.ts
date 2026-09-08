// Export centralisé de tous les services
export { playersService } from './playersService';
export { matchesService } from './matchesService';
export { matchRatingsService } from './matchRatingsService';
export { trainingsService } from './trainingsService';
export { teamsService } from './teamsService';
export { matchEventsService } from './matchEventsService';
export { schematicsService } from './schematicsService';
export { sharedContentService } from './sharedContentService';
export type { ContentAnalyticsRow, CreateSharedLinkInput, CreateSharedFileInput } from './sharedContentService';
export { clubsService } from './clubsService';
export type { ClubInvitationRow, ClubTeamRow } from './clubsService';
export { notificationsService, DEFAULT_NOTIF_PREFS } from './notificationsService';
export type { CoachNotifType, NotificationPreferences, NotificationTeamPreference } from './notificationsService';
export {
  createTokensForTraining,
  getFeedbackSessionByToken,
  submitTrainingFeedback,
  getFeedbackLinksForTraining,
  getPlayerTrainingFeedback,
  getTeamFeedbackForLastSessions,
  getTrainingFeedbackResponses
} from './trainingFeedbackService';
export type { PlayerTrainingFeedbackRow, TeamFeedbackRow, TrainingFeedbackResponse } from './trainingFeedbackService';
export {
  getMyConvocations,
  setMyTrainingAttendance,
  getMyPendingFeedbackTokens,
  createPlayerLinkCode,
  claimPlayerLinkCode
} from './playerConvocationsService';
export type { MyConvolutionRow, MyPendingFeedbackRow } from './playerConvocationsService';
export {
  reportMyPain,
  reportPainByToken,
  getPlayerPainReports,
  getClubPainReports,
  deleteMyPainReport
} from './painReportsService';
export { trainingLoadService, defaultLoadWindow } from './trainingLoadService';
export { availabilityService } from './availabilityService';
export type { SetAvailabilityInput } from './availabilityService';
export { physicalTestsService } from './physicalTestsService';
export type { AttemptInput, ResultInput, SessionInput } from './physicalTestsService';
export { deleteOwnAccount } from './accountService';
export type { DeleteOwnAccountResult } from './accountService';

