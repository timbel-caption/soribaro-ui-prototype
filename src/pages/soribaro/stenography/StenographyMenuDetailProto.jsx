import WorkDetailProto from '../enterprise/proto/WorkDetailProto';
import { getStenographySamples } from '../enterprise/proto/protoStore';

export default function StenographyMenuDetailProto() {
  return <WorkDetailProto samples={getStenographySamples()} backPath="/soribaro/stenography/work" />;
}
