import { userStorage } from './userStorage';
import { placeStorage } from './placeStorage';
import { merchantStorage } from './merchantStorage';
import { gachaStorage } from './gachaStorage';
import { locationStorage } from './locationStorage';
import { specialistStorage } from './specialistStorage';
import { sosStorage } from './sosStorage';
import { commerceStorage } from './commerceStorage';
import { adminStorage } from './adminStorage';
import { subscriptionStorage } from './subscriptionStorage';
import * as economyStorage from './economyStorage';
import * as crowdfundStorage from './crowdfundStorage';
import * as referralStorage from './referralStorage';
import * as contributionStorage from './contributionStorage';

export const storage = {
  ...userStorage,
  ...placeStorage,
  ...merchantStorage,
  ...gachaStorage,
  ...locationStorage,
  ...specialistStorage,
  ...sosStorage,
  ...commerceStorage,
  ...adminStorage,
  ...subscriptionStorage,
};

export {
  userStorage,
  placeStorage,
  merchantStorage,
  gachaStorage,
  locationStorage,
  specialistStorage,
  sosStorage,
  commerceStorage,
  adminStorage,
  subscriptionStorage,
  economyStorage,
  crowdfundStorage,
  referralStorage,
  contributionStorage,
};
