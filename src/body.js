// Her body, measured once when a model loads, so poses fit any proportions: a chibi with a big
// head and short arms, or a tall figure. Poses say where a hand should be (beside the cheek,
// hands together in front of her) and `solveArm` works out the arm for this body.
//
// Everything here is in VRM 1.0 space (see moves.js): she faces +z, her left is +x. A loaded
// model is already turned that way in world space, for VRM 0.x and 1.0 alike.

import * as THREE from 'three'

/** A normal-proportioned figure, for when a model can't be measured (and for tests). */
export function defaultBody() {
  return {
    height: 1.5,
    upperArm: 0.24,
    lowerArm: 0.22,
    /** Wrist to fingertip. */
    hand: 0.1,
    shoulder: { right: [-0.13, 1.17, 0], left: [0.13, 1.17, 0] },
    hipsY: 0.8,
    face: { eyeY: 1.36, halfWidth: 0.08, height: 0.2, front: 0.09 },
    /** How far her body reaches beside and in front of her hands, at hand height. */
    clearX: 0.15,
    frontZ: 0.09,
  }
}

const worldOf = node => node.getWorldPosition(new THREE.Vector3())

/** Every bone under `bone`, itself included. */
function subtree(bone, into = new Set()) {
  if (bone) {
    bone.traverse(child => into.add(child))
  }
  return into
}

/**
 * Measures a loaded model in her T-pose. Bones give arm lengths and shoulders; the skinned mesh
 * gives her face and how wide and deep her body (skirt included) is where her hands hang.
 */
export function measureBody(vrm) {
  const raw = name => vrm.humanoid.getRawBoneNode(name)
  const fallback = defaultBody()
  const head = raw('head')
  const hips = raw('hips')
  const rightArm = raw('rightUpperArm')
  const leftArm = raw('leftUpperArm')
  const rightLower = raw('rightLowerArm')
  const rightHand = raw('rightHand')
  if (!head || !hips || !rightArm || !leftArm || !rightLower || !rightHand) {
    return fallback
  }
  vrm.scene.updateWorldMatrix(true, true)
  const box = new THREE.Box3().setFromObject(vrm.scene)
  const height = box.max.y - box.min.y
  const headPosition = worldOf(head)
  const rightShoulder = worldOf(rightArm)
  const leftShoulder = worldOf(leftArm)
  const elbow = worldOf(rightLower)
  const wrist = worldOf(rightHand)
  const hipsY = worldOf(hips).y
  const upperArm = rightShoulder.distanceTo(elbow)
  const lowerArm = elbow.distanceTo(wrist)
  const handY = rightShoulder.y - (upperArm + lowerArm) * 0.95
  // Wrist to fingertip: to the middle finger's last joint, plus a bit for the tip.
  const fingerJoint = raw('rightMiddleDistal') ?? raw('rightMiddleIntermediate')
  const hand = fingerJoint ? wrist.distanceTo(worldOf(fingerJoint)) * (raw('rightMiddleDistal') ? 1.2 : 1.5) : height * 0.065

  // Sort the mesh's bones: her head itself, then things that shouldn't count as her body.
  const hanging = new Set() // hair and face parts under the head, both arms
  subtree(head, hanging)
  subtree(rightArm, hanging)
  subtree(leftArm, hanging)

  const faceBox = new THREE.Box3()
  const headPoints = []
  let clearX = 0
  let frontZ = 0
  const point = new THREE.Vector3()
  vrm.scene.traverse(mesh => {
    const position = mesh.geometry?.attributes?.position
    const indices = mesh.geometry?.attributes?.skinIndex
    const weights = mesh.geometry?.attributes?.skinWeight
    if (!mesh.isSkinnedMesh || !position || !indices || !weights) {
      return
    }
    const bones = mesh.skeleton.bones
    // Every other vertex is plenty for a measurement.
    for (let i = 0; i < position.count; i += 2) {
      let best = 0
      let bestWeight = -1
      for (let k = 0; k < 4; k++) {
        const weight = weights.getComponent(i, k)
        if (weight > bestWeight) {
          bestWeight = weight
          best = indices.getComponent(i, k)
        }
      }
      const bone = bones[best]
      point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld)
      if (bone === head) {
        faceBox.expandByPoint(point)
        headPoints.push(point.x, point.y, point.z)
      } else if (bone && !hanging.has(bone) && Math.abs(point.y - handY) < height * 0.08) {
        clearX = Math.max(clearX, Math.abs(point.x))
        frontZ = Math.max(frontZ, point.z)
      }
    }
  })

  // The mesh box finds her head, but it can include the top of her skull and where twintails
  // join. Eye bones say where her face really is, so they win when the model has them.
  const hasFace = !faceBox.isEmpty()
  const faceSize = hasFace ? faceBox.getSize(new THREE.Vector3()) : null
  const leftEye = raw('leftEye') && worldOf(raw('leftEye'))
  const rightEye = raw('rightEye') && worldOf(raw('rightEye'))
  const eyes = leftEye && rightEye && leftEye.distanceTo(rightEye) > 1e-3 ? { y: (leftEye.y + rightEye.y) / 2, gap: leftEye.distanceTo(rightEye) } : null
  // How wide her face really is: the front of her head, at eye level. Works for a chibi's wide
  // face and a tall figure's narrow one, and skips twintail roots and back hair.
  let faceWidth = 0
  if (hasFace && eyes) {
    const middleZ = faceBox.getCenter(new THREE.Vector3()).z
    for (let i = 0; i < headPoints.length; i += 3) {
      if (Math.abs(headPoints[i + 1] - eyes.y) < height * 0.015 && headPoints[i + 2] >= middleZ) {
        faceWidth = Math.max(faceWidth, Math.abs(headPoints[i]))
      }
    }
  }
  return {
    height,
    upperArm,
    lowerArm,
    hand: THREE.MathUtils.clamp(hand, height * 0.04, height * 0.1),
    shoulder: { right: rightShoulder.toArray(), left: leftShoulder.toArray() },
    hipsY,
    face: hasFace
      ? {
          eyeY: eyes ? eyes.y : faceBox.getCenter(new THREE.Vector3()).y - faceSize.y * 0.1,
          halfWidth: faceWidth > 0 ? Math.min(faceWidth, faceSize.x / 2) : eyes ? eyes.gap * 1.6 : faceSize.x / 2,
          height: faceSize.y,
          front: faceBox.max.z,
        }
      : {
          eyeY: eyes ? eyes.y : headPosition.y + height * 0.05,
          halfWidth: eyes ? eyes.gap * 1.6 : height * 0.055,
          height: height * 0.14,
          front: height * 0.06,
        },
    clearX: clearX || Math.abs(rightShoulder.x),
    frontZ: frontZ || height * 0.06,
  }
}

const AXIS_Y = new THREE.Vector3(0, 1, 0)

/**
 * The arm that puts `side`'s wrist at `target` ([x, y, z] in world space), with the elbow
 * leaning toward `pole`. The elbow only ever bends the way an elbow does, so the palm ends up
 * facing naturally without twisting the wrist. Too-far targets are reached for as far as the arm goes.
 *
 * Returns Euler angles { upper, lower } for sampledClip, written in VRM 1.0 space.
 */
export function solveArm(side, body, target, pole = [0, -1, -0.3]) {
  const outward = new THREE.Vector3(side === 'right' ? -1 : 1, 0, 0)
  const bendSign = side === 'right' ? 1 : -1
  const lengthA = body.upperArm
  const lengthB = body.lowerArm
  const shoulder = new THREE.Vector3(...body.shoulder[side])
  const toTarget = new THREE.Vector3(...target).sub(shoulder)
  const distance = THREE.MathUtils.clamp(toTarget.length(), Math.abs(lengthA - lengthB) * 1.05 + 1e-4, (lengthA + lengthB) * 0.995)
  const direction = toTarget.lengthSq() > 1e-8 ? toTarget.normalize() : outward.clone()

  // The elbow: from the two lengths, off the shoulder–wrist line toward the pole.
  const along = (lengthA * lengthA - lengthB * lengthB + distance * distance) / (2 * distance)
  const off = Math.sqrt(Math.max(0, lengthA * lengthA - along * along))
  const toward = new THREE.Vector3(...pole)
  toward.addScaledVector(direction, -toward.dot(direction))
  if (toward.lengthSq() < 1e-6) {
    toward.set(0, -1, 0).addScaledVector(direction, direction.y)
  }
  toward.normalize()
  const elbow = direction.clone().multiplyScalar(along).addScaledVector(toward, off)
  const wrist = direction.clone().multiplyScalar(distance)
  const upperDirection = elbow.clone().normalize()
  const lowerDirection = wrist.clone().sub(elbow).normalize()

  const bend = upperDirection.angleTo(lowerDirection)
  // The bend's axis. For a nearly straight arm any axis fits: keep the palm toward her body.
  const axis = upperDirection.clone().cross(lowerDirection)
  if (axis.lengthSq() < 1e-4) {
    axis.set(0, 0, 1).cross(upperDirection).multiplyScalar(-1)
    axis.multiplyScalar(bendSign * Math.sign(outward.x) || 1)
  }
  axis.normalize()

  // The upper arm's whole rotation: the arm's rest line onto the upper arm, its y axis onto the
  // bend's axis (a right elbow bends about +y, a left about -y).
  const restSide = outward.clone().cross(AXIS_Y)
  const yAfter = axis.clone().multiplyScalar(bendSign)
  const sideAfter = upperDirection.clone().cross(yAfter)
  const from = new THREE.Matrix4().makeBasis(outward, AXIS_Y, restSide)
  const to = new THREE.Matrix4().makeBasis(upperDirection, yAfter, sideAfter)
  const rotation = to.multiply(from.invert())
  const euler = new THREE.Euler().setFromRotationMatrix(rotation, 'XYZ')
  return { upper: [euler.x, euler.y, euler.z], lower: [0, bendSign * bend, 0] }
}

/** Where `solveArm`'s answer really puts the wrist (forward kinematics), for tests and checks. */
export function wristOf(side, body, { upper, lower }) {
  const outward = new THREE.Vector3(side === 'right' ? -1 : 1, 0, 0)
  const upperQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(...upper))
  const lowerQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(...lower))
  const elbow = outward.clone().multiplyScalar(body.upperArm).applyQuaternion(upperQ)
  const forearm = outward.clone().multiplyScalar(body.lowerArm).applyQuaternion(lowerQ).applyQuaternion(upperQ)
  return new THREE.Vector3(...body.shoulder[side]).add(elbow).add(forearm).toArray()
}
