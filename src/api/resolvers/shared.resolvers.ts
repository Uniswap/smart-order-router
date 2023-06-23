import { BigIntResolver, DateTimeResolver } from "graphql-scalars";

export const SharedResolvers = {
  BigInt: BigIntResolver,
  DateTime: DateTimeResolver,
};
