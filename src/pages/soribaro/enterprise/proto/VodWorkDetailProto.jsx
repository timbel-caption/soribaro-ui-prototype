import WorkDetailProto from './WorkDetailProto';
import { getVodSamples } from './protoStore';

export default function VodWorkDetailProto() {
  return <WorkDetailProto samples={getVodSamples()} backPath="/soribaro/enterprise/vod" />;
}
