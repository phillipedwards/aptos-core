// import * as ip6 from 'ip6';

// export interface SubnetInfo {
//     firstAddress: string;
//     lastAddress: string;
//     subnetMaskLength: number;
//     cidr: string;
// }

// // Function to calculate next available subnet
// export const getNextSubnet = (cidr: string, newBits: number, nth: number): string => {
//     const [ip, bits] = cidr.split('/');
//     const ipBytes = ip6.toByteArray(ip);
//     const newBitsValue = nth << (32 - (Number(bits) + newBits));
//     const newIpBytes = new Uint8Array(4);

//     for (let i = 0; i < 4; i++) {
//         newIpBytes[i] = ipBytes[i] | ((newBitsValue >> ((3 - i) * 8)) & 0xFF);
//     }

//     const newIp = ip6.fromByteArray(newIpBytes);
//     return `${newIp}/${Number(bits) + newBits}`;
// };

// // Function to calculate multiple subnets
// export function getSubnets(cidr: string, numSubnets: number, subnetSizes: number[]): SubnetInfo[] {
//     const isIPv6 = cidr.includes(':');
//     const subnets: SubnetInfo[] = [];

//     let nextSubnet = ip6.cidrSubnet(cidr);

//     for (let i = 0; i < numSubnets; i++) {
//         const subnetSize = subnetSizes[i] || subnetSizes[subnetSizes.length - 1];
//         const newSubnet = ip6.cidrSubnet(nextSubnet.firstAddress + '/' + subnetSize);
//         subnets.push({
//             firstAddress: newSubnet.firstAddress,
//             lastAddress: newSubnet.lastAddress,
//             subnetMaskLength: newSubnet.subnetMaskLength,
//             cidr: `${newSubnet.firstAddress}/${newSubnet.subnetMaskLength}`
//         });

//         // Update nextSubnet to start where the last one ended
//         nextSubnet = ip6.cidrSubnet(newSubnet.lastAddress + '/' + nextSubnet.subnetMaskLength);
//     }

//     return subnets;
// }


// // // Function to calculate next available subnet
// // export const getNextSubnet = (cidr: string, newBits: number, nth: number): string => {
// //     const [ip, bits] = cidr.split('/');
// //     const ipBytes = toByteArray(ip);
// //     const newBitsValue = nth << (32 - (Number(bits) + newBits));
// //     const newIpBytes = new Uint8Array(4);

// //     for (let i = 0; i < 4; i++) {
// //         newIpBytes[i] = ipBytes[i] | ((newBitsValue >> ((3 - i) * 8)) & 0xFF);
// //     }

// //     const newIp = fromByteArray(newIpBytes);
// //     return `${newIp}/${Number(bits) + newBits}`;
// // };

// // // Function to calculate multiple subnets
// // /**
// //  * Returns an array of subnet information objects based on the provided CIDR block, number of subnets, and subnet sizes.
// //  * @param cidr - The CIDR block to use for subnetting.
// //  * @param numSubnets - The number of subnets to create.
// //  * @param subnetSizes - An array of subnet sizes to use for each subnet. If not provided, the last subnet size will be used for all subnets.
// //  * @returns An array of subnet information objects.
// //  */
// // export function getSubnets(cidr: string, numSubnets: number, subnetSizes: number[]): SubnetInfo[] {
// //     const isIPv6 = cidr.includes(':');
// //     const ip = isIPv6 ? ip6 : ip4;
// //     const subnets: SubnetInfo[] = [];

// //     let nextSubnet = ip.cidrSubnet(cidr);

// //     for (let i = 0; i < numSubnets; i++) {
// //         const subnetSize = subnetSizes[i] || subnetSizes[subnetSizes.length - 1];
// //         const newSubnet = ip.cidrSubnet(nextSubnet.firstAddress + '/' + subnetSize);
// //         subnets.push({
// //             ...newSubnet,
// //             cidr: `${newSubnet.firstAddress}/${newSubnet.subnetMaskLength}`  // Add this line
// //         });

// //         // Update nextSubnet to start where the last one ended
// //         nextSubnet = ip.cidrSubnet(newSubnet.lastAddress + '/' + nextSubnet.subnetMaskLength);
// //     }

// //     return subnets;
// // }





// const maxSubnetCidrRanges = getSubnets(config.vpcCidrBlock, 1, [
//     ...Array.from({ length: numOtherSubnets }, (_, i) => 1 + Math.ceil(Math.pow(numOtherSubnets, 0.5))),
// ]);

// const maxPrivateSubnetCidrRanges = maxSubnetCidrRanges.slice(0, numAzs).map(subnet => subnet.cidr);
// const maxPublicSubnetCidrRanges = maxSubnetCidrRanges.slice(numAzs, numAzs * 2).map(subnet => subnet.cidr);

// const defaultPublicSubnetCidrRanges = Array.from({ length: numAzs }, (_, i) =>
//     getNextSubnet(getNextSubnet(config.vpcCidrBlock, 1, 0), 2, i)
// );
// const defaultPrivateSubnetCidrRanges = Array.from({ length: numAzs }, (_, i) =>
//     getNextSubnet(getNextSubnet(config.vpcCidrBlock, 1, 1), 2, i)
// );
