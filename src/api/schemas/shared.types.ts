import { gql } from "apollo-server-express";

export const sharedTypeDefs = gql`
  scalar BigInt
  scalar DateTime
  scalar BigDecimal
`;
