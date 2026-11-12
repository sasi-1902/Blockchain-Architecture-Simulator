import type { BlockchainArchitecture } from '../../engine/types'
import { validateArchitecture } from '../../engine/validateArchitecture'
import { iroha1Components } from './components'
import { iroha1Connections } from './connections'
import { iroha1Concepts } from './concepts'
import { aliceSendsTenUsdToBobScenario } from './scenarios/happyPath'
import { uc01BlockFormationPlaceholderScenario } from './scenarios/uc01BlockFormationPlaceholder'

const rawIroha1Architecture: BlockchainArchitecture = {
  id: 'iroha1',
  displayName: 'Hyperledger Iroha v1 — Classic Architecture',
  vendor: 'Hyperledger',
  shortDescription:
    'The classic C++ Hyperledger Iroha v1 transaction pipeline, from client submission through YAC consensus and commit.',
  sourceLinks: [
    {
      label: 'Hyperledger Iroha architecture documentation',
      url: 'https://iroha.readthedocs.io/en/main/concepts_architecture/architecture.html',
    },
    {
      label: 'Hyperledger Iroha architecture wiki',
      url: 'https://wiki.hyperledger.org/display/iroha/Architecture',
    },
    { label: 'Hyperledger Iroha source repository', url: 'https://github.com/hyperledger/iroha' },
  ],
  components: iroha1Components,
  connections: iroha1Connections,
  concepts: iroha1Concepts,
  scenarios: [aliceSendsTenUsdToBobScenario, uc01BlockFormationPlaceholderScenario],
}

export const iroha1Architecture: BlockchainArchitecture = validateArchitecture(rawIroha1Architecture)
