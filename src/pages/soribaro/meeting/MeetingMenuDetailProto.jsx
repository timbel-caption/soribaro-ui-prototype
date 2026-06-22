import WorkDetailProto from '../enterprise/proto/WorkDetailProto';
import { getMeetingSamples } from '../enterprise/proto/protoStore';

export default function MeetingMenuDetailProto() {
  return <WorkDetailProto samples={getMeetingSamples()} backPath="/soribaro/meeting/work" />;
}
