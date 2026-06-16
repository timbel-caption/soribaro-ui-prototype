import WorkDetailProto from './WorkDetailProto';
import { getMeetingSamples } from './protoStore';

export default function MeetingWorkDetailProto() {
  return <WorkDetailProto samples={getMeetingSamples()} backPath="/soribaro/enterprise/meeting" />;
}
