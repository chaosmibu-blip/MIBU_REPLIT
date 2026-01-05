import { userStorage } from './userStorage';
import { placeStorage } from './placeStorage';
import { merchantStorage } from './merchantStorage';
import { gachaStorage } from './gachaStorage';
import { locationStorage } from './locationStorage';
import { specialistStorage } from './specialistStorage';
import { sosStorage } from './sosStorage';
import { commerceStorage } from './commerceStorage';
import { adminStorage } from './adminStorage';

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
};
