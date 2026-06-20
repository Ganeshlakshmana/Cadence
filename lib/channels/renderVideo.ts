import type { StrategyTouch } from '@/lib/llm/schemas';

export interface VideoPreviewData {
  channel: 'video';
  script: string;
  durationEstimateSeconds: number;
  thumbnailPlaceholder: string;
  generationNote: string;
  dayOffset: number;
  reasoning: string;
  stageDirections: string[];
}

export function renderVideo(
  touch: StrategyTouch,
  _installerName: string = 'Solar Sales Rep',
): VideoPreviewData {
  const script = touch.contentBody;
  const wordCount = script.split(/\s+/).length;
  const durationEstimateSeconds = Math.round((wordCount / 130) * 60); // 130 wpm for video

  // Parse stage directions if present (lines starting with [)
  const stageDirections = script
    .split('\n')
    .filter(line => line.trim().startsWith('[') && line.trim().endsWith(']'))
    .map(line => line.trim().slice(1, -1));

  return {
    channel: 'video',
    script,
    durationEstimateSeconds,
    thumbnailPlaceholder: '/fixtures/video-avatar-placeholder.png',
    generationNote: 'Video generation via HeyGen/Tavus — integration available in production build',
    dayOffset: touch.dayOffset,
    reasoning: touch.reasoning,
    stageDirections,
  };
}
