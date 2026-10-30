import * as cdk from "aws-cdk-lib";
import { RegionInfo } from "aws-cdk-lib/region-info";

/**
 * Literal partition ("aws" / "aws-cn" / ...) for a stack with a concrete region,
 * falling back to the AWS::Partition pseudo-parameter for env-agnostic stacks.
 * Emitting the literal (rather than always Aws.PARTITION) keeps the aws-partition
 * templates byte-identical to the pre-China-support output.
 */
export function partitionOf(stack: cdk.Stack): string {
  if (cdk.Token.isUnresolved(stack.region)) return cdk.Aws.PARTITION;
  return RegionInfo.get(stack.region).partition ?? cdk.Aws.PARTITION;
}

/** DNS suffix ("amazonaws.com" / "amazonaws.com.cn"), literal when region is concrete. */
export function urlSuffixOf(stack: cdk.Stack): string {
  if (cdk.Token.isUnresolved(stack.region)) return cdk.Aws.URL_SUFFIX;
  return RegionInfo.get(stack.region).domainSuffix ?? cdk.Aws.URL_SUFFIX;
}
