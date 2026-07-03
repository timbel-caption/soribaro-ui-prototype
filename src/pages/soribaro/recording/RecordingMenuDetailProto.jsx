import WorkDetailProto from '../enterprise/proto/WorkDetailProto';
import { getRecordingSamples } from '../enterprise/proto/protoStore';

export default function RecordingMenuDetailProto() {
  return <WorkDetailProto samples={getRecordingSamples()} backPath="/soribaro/recording/work" />;
}
