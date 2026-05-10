export type StudioCameraHandoff = {
  stream: MediaStream;
  label: string;
  deviceId?: string;
  groupId?: string;
};

const cameraHandoffs = new Map<string, StudioCameraHandoff[]>();

function stopHandoffStreams(streams: StudioCameraHandoff[]) {
  streams.forEach(({ stream }) => stream.getTracks().forEach((track) => track.stop()));
}

export function stashStudioCameraStreams(streamId: string, streams: StudioCameraHandoff[]) {
  const existing = cameraHandoffs.get(streamId);
  if (existing) stopHandoffStreams(existing);
  cameraHandoffs.set(streamId, streams);
}

export function takeStudioCameraStreams(streamId: string) {
  const streams = cameraHandoffs.get(streamId) ?? [];
  cameraHandoffs.delete(streamId);
  return streams;
}

export function releaseStudioCameraStreams(streams: StudioCameraHandoff[]) {
  stopHandoffStreams(streams);
}