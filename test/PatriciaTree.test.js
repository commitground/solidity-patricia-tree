const chai = require('chai')
const assert = chai.assert
const BigNumber = web3.BigNumber
const should = chai.use(require('chai-bignumber')(BigNumber)).should()

const PatriciaTreeImplementation = artifacts.require('PatriciaTreeImplementation')
const { toNodeObject, progress } = require('./utils')

const ZERO = '0x0000000000000000000000000000000000000000000000000000000000000000'

String.prototype.hex = function() {
  return web3.utils.stringToHex(this)
}
const FOO = 'foo'.hex()
const BAR = 'bar'.hex()
const BAZ = 'baz'.hex()
const QUX = 'qux'.hex()
const FUZ = 'fuz'.hex()
const KEY1 = 'key1'.hex()
const KEY2 = 'key2'.hex()
const KEY3 = 'key3'.hex()
const KEY4 = 'key4'.hex()
const KEY5 = 'key5'.hex()
const VAL1 = 'val1'.hex()
const VAL2 = 'val2'.hex()
const VAL3 = 'val3'.hex()
const VAL4 = 'val4'.hex()
const VAL5 = 'val5'.hex()
const VALUE1 = 'value1'.hex()
const VALUE2 = 'value2'.hex()
const VALUE3 = 'value3'.hex()
const VALUE4 = 'value4'.hex()
const VALUE5 = 'value5'.hex()

contract('PatriciaTree', async ([_, primary, nonPrimary]) => {
  context('inherits the patricia tree smart contract', async () => {
    let tree
    beforeEach('deploy PatriciaTree', async () => {
      tree = await PatriciaTreeImplementation.new({ from: primary })
    })
    describe('insert()', async () => {
      it('should not use gas more than 1 million', async () => {
        let itemCount = 10
        let items = {}
        for (let i = 0; i < itemCount; i++) {
          items[web3.utils.sha3('key' + Math.random())] = web3.utils.sha3('val' + Math.random())
        }
        let count = 1
        for (const key of Object.keys(items)) {
          await tree.insert(key.hex(), items[key], { from: primary })
          let estimatedGasToAddNewValue = await tree.insert.estimateGas(web3.utils.sha3('key' + Math.random()), web3.utils.sha3('val' + Math.random()), { from: primary })
          progress.log(`(${count++}/${itemCount}) Required gas for a transaction: ${estimatedGasToAddNewValue}`)
          assert.isTrue(estimatedGasToAddNewValue < 1000000)
        }
        progress.close()
      })
      it('should allow only primary address to put items', async () => {
        await tree.insert(FOO, BAR, { from: primary })
      })
      it('should allow overwriting', async () => {
        await tree.insert(FOO, BAR, { from: primary })
        await tree.insert(FOO, BAZ, { from: primary })
        assert.equal(await tree.get(FOO), BAZ)
      })
      it('should revert when a non-primary address tries to insert a new item', async () => {
        try {
          await tree.insert(FOO, BAR, { from: nonPrimary })
          assert.fail('it should throw an error')
        } catch (e) {
          assert.ok('it is successfully reverted')
        }
      })
    })

    describe('getRootHash()', async () => {
      it('should return its root hash value as zero when nothing is stored', async () => {
        assert.equal(await tree.getRootHash(), ZERO)
      })
      it('should update its root hash when every new items are put into', async () => {
        // insert an item
        await tree.insert(FOO, BAR, { from: primary })
        let firstRootHash = await tree.getRootHash()
        // insert an item again
        await tree.insert(BAZ, QUX, { from: primary })
        let secondRootHash = await tree.getRootHash()
        assert.notEqual(firstRootHash, secondRootHash)
        // insert an item again
        await tree.insert(FOO, BAZ, { from: primary })
        let thirdRootHash = await tree.getRootHash()
        assert.notEqual(secondRootHash, thirdRootHash)
      })

      it('should return same root hash for same write history', async () => {
        //  define items to put
        let items = {
          key1: VAL1,
          key2: VAL2,
          key3: VAL3
        }

        //  insert items into the first tree
        for (const key of Object.keys(items)) {
          progress.log(`Insert items (${key}, ${items[key]})`)
          await tree.insert(key.hex(), items[key], { from: primary })
        }
        progress.close()
        // get root hash of the first tree
        let rootEdgeOfTree = await tree.getRootEdge()
        let rootHashOfTree = rootEdgeOfTree[2]

        // deploy a second tree
        let secondTree = await PatriciaTreeImplementation.new({ from: primary })
        // insert same items into the second tree
        for (const key of Object.keys(items)) {
          await progress.log(`Insert items into the second tree (${key}, ${items[key]})`, 500)
          await secondTree.insert(key.hex(), items[key], { from: primary })
        }
        progress.close()
        // get root hash of the second tree
        let rootEdgeOfSecondTree = await secondTree.getRootEdge()
        let rootHashOfSecondTree = rootEdgeOfSecondTree[2]

        // compare the two root hashes
        assert.equal(rootHashOfTree, rootHashOfSecondTree)
      })
    })

    describe('getNode()', async () => {
      it('should able to find all nodes', async () => {
        let items = {
          KEY1: VALUE1,
          KEY2: VALUE2,
          KEY3: VALUE3,
          KEY4: VALUE4,
          KEY5: VALUE5
        }

        // insert items
        for (const key of Object.keys(items)) {
          await tree.insert(key.hex(), items[key], { from: primary })
        }

        // find all nodes and check stored value hash
        let leafNodes = []
        let nodeObjs = []

        const getNodeRecursively = (depth, parent, hash) => new Promise(async res => {
          let result = await tree.getNode(hash)
          let nodes = [
            [result[0], result[1], result[2]],
            [result[3], result[4], result[5]]]
          for (let i = 0; i < nodes.length; i++) {
            let nodeObj = toNodeObject(depth, hash, nodes[i])
            nodeObjs.push(nodeObj)
            let nodeHashValue = nodeObj.node
            if (nodeHashValue == ZERO) {
              // Because an edge should always have two nodes, it duplicates a leaf node when only one exist.
              // Therefore, if there already exists a same node, do not push it into the leaf node array.
              let leafNode = {
                parent,
                hash
              }
              let leafNodeAlreadyExist = leafNodes.reduce((val, item) => JSON.stringify(item) === JSON.stringify(leafNode), 0)
              if (!leafNodeAlreadyExist) {
                leafNodes.push(leafNode)
              }
            } else {
              await getNodeRecursively(depth + 1, hash, nodeHashValue)
            }
          }
          progress.close()
          res()
        })

        // Get root hash to start to find nodes recursively
        let rootNode = toNodeObject(0, 'root', await tree.getRootEdge())
        let rootValue = rootNode.node
        // Find nodes recursively and add leaf nodes to the array
        await getNodeRecursively(1, 'root', rootValue)

        // Compare the found leaf nodes and initial items
        let hashValuesFromLeafNodes = leafNodes.map(leafNode => leafNode.hash)
        let hashValuesFromInitialItems = Object.values(items).map(item => web3.utils.sha3(item))
        assert.equal(
          JSON.stringify(hashValuesFromLeafNodes.sort()),
          JSON.stringify(hashValuesFromInitialItems.sort())
        )

        // if you want to see more in detail, you can print the leafNodes and nodeObj arrays.
        // console.log(nodeObjs);
        // console.log(leafNodes);
      })
    })

    describe('getProof() & verifyProof()', async () => {
      it('should be able to verify merkle proof for a given key', async () => {
        let items = { key1: VALUE1, key2: VALUE2, key3: VALUE3 }
        for (const key of Object.keys(items)) {
          await tree.insert(key.hex(), items[key], { from: primary })
        }
        let count = 0
        for (const key of Object.keys(items)) {
          let {branchMask, _siblings} = await tree.getProof(key.hex())
          let rootHash = await tree.getRootHash()
          await tree.verifyProof(rootHash, key.hex(), items[key], branchMask, _siblings)
          progress.log(`(${count++}/${Object.keys(items).length}) Merkle proof for ${key}:${items[key]}`)
          assert.ok('is not reverted')
        }
        progress.close()
      })

      it('should throw an error for an invalid merkle proof', async () => {
        let items = { key1: VALUE1, key2: VALUE2, key3: VALUE3 }
        for (const key of Object.keys(items)) {
          await tree.insert(key.hex(), items[key], { from: primary })
        }
        let count = 0
        for (const key of Object.keys(items)) {
          let {branchMask, _siblings} = await tree.getProof(key.hex())
          let rootHash = await tree.getRootHash()
          try {
            await tree.verifyProof(rootHash, key, `manipulate${items[key]}`, branchMask, _siblings)
          } catch (e) {
            progress.log(`(${count++}/${Object.keys(items).length}) fraud proof for ${key}:${items[key]}`)
            assert.ok('reverted')
          }
        }
        progress.close()
      })
    })

    describe('get()', async () => {
      it('should return stored value for the given key', async () => {
        await tree.insert(FOO, BAR, { from: primary })
        assert.equal(await tree.get(FOO), BAR)
      })
    })

    describe('safeGet()', async () => {
      it('should return stored value for the given key', async () => {
        await tree.insert(FOO, BAR, { from: primary })
        assert.equal(await tree.get(FOO), BAR)
      })
      it('should throw if the given key is not included', async () => {
        await tree.insert(FOO, BAR, { from: primary })
        try {
          await tree.get(FUZ)
          assert.fail('Did not reverted')
        } catch (e) {
          assert.ok('Reverted successfully')
        }
      })
    })

    describe('doesInclude()', async () => {
      it('should return boolean whether the tree includes the given key or not', async () => {
        await tree.insert(FOO, BAR, { from: primary })
        assert.equal(await tree.doesInclude(FOO), true)
        assert.equal(await tree.doesInclude(FUZ), false)
      })
    })

    describe('getNonInclusionProof()', async () => {
      let items = { key1: VALUE1, key2: VALUE2, key3: VALUE3 }
      it('should return proof data when the key does not exist', async () => {
        for (const key of Object.keys(items)) {
          await tree.insert(key.hex(), items[key], { from: primary })
        }
        await tree.getNonInclusionProof(KEY4)
      })
      it('should not return data when the key does exist', async () => {
        for (const key of Object.keys(items)) {
          await tree.insert(key.hex(), items[key], { from: primary })
        }
        try {
          await tree.getNonInclusionProof(KEY1)
          assert.fail('Did not reverted')
        } catch (e) {
          assert.ok('Reverted successfully')
        }
      })
    })

    describe('verifyNonInclusionProof()', async () => {
      it('should be passed when we use correct proof data', async () => {
        let items = { key1: VALUE1, key2: VALUE2, key3: VALUE3 }
        for (const key of Object.keys(items)) {
          await tree.insert(key.hex(), items[key], { from: primary })
        }
        let rootHash = await tree.getRootHash()
        let {leafLabel, leafNode, branchMask, _siblings} = await tree.getNonInclusionProof(KEY4)
        await tree.verifyNonInclusionProof(rootHash, KEY4, leafLabel, leafNode, branchMask, _siblings)
        for (const key of Object.keys(items)) {
          try {
            await tree.verifyNonInclusionProof(rootHash, key.hex(), potentialSiblingLabel, potentialSiblingValue, branchMask, _siblings)
            assert.fail('Did not reverted')
          } catch (e) {
            assert.ok('Reverted successfully')
          }
        }
      })
    })
  })
})
