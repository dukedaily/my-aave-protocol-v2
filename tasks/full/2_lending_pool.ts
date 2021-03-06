import { task } from 'hardhat/config';
import { getParamPerNetwork, insertContractAddressInDb } from '../../helpers/contracts-helpers';
import {
  deployATokenImplementations,
  deployATokensAndRatesHelper,
  deployLendingPool,
  deployLendingPoolConfigurator,
  deployStableAndVariableTokensHelper,
} from '../../helpers/contracts-deployments';
import { eContractid, eNetwork } from '../../helpers/types';
import { notFalsyOrZeroAddress, waitForTx } from '../../helpers/misc-utils';
import {
  getLendingPoolAddressesProvider,
  getLendingPool,
  getLendingPoolConfiguratorProxy,
} from '../../helpers/contracts-getters';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import {
  loadPoolConfig,
  ConfigNames,
  getGenesisPoolAdmin,
  getEmergencyAdmin,
} from '../../helpers/configuration';

task('full:deploy-lending-pool', 'Deploy lending pool for dev enviroment')
  .addFlag('verify', 'Verify contracts at Etherscan')
  .addParam('pool', `Pool name to retrieve configuration, supported: ${Object.values(ConfigNames)}`)
  .setAction(async ({ verify, pool }, DRE: HardhatRuntimeEnvironment) => {
    try {
      await DRE.run('set-DRE');
      const network = <eNetwork>DRE.network.name;
      const poolConfig = loadPoolConfig(pool);
      const addressesProvider = await getLendingPoolAddressesProvider();
      console.log('addressesProvider:', addressesProvider.address);

      const { LendingPool, LendingPoolConfigurator } = poolConfig;

      // Reuse/deploy lending pool implementation
      let lendingPoolImplAddress = getParamPerNetwork(LendingPool, network);
      if (!notFalsyOrZeroAddress(lendingPoolImplAddress)) {
        console.log('\tDeploying new lending pool implementation & libraries...');
        const lendingPoolImpl = await deployLendingPool(verify);
        lendingPoolImplAddress = lendingPoolImpl.address;
        await lendingPoolImpl.initialize(addressesProvider.address);
      }
      console.log('\tSetting lending pool implementation with address:', lendingPoolImplAddress);
      // Set lending pool impl to Address provider
      await waitForTx(await addressesProvider.setLendingPoolImpl(lendingPoolImplAddress));

      const address = await addressesProvider.getLendingPool();
      const lendingPoolProxy = await getLendingPool(address);

      await insertContractAddressInDb(eContractid.LendingPool, lendingPoolProxy.address);

      // Reuse/deploy lending pool configurator
      let lendingPoolConfiguratorImplAddress = getParamPerNetwork(LendingPoolConfigurator, network); //await deployLendingPoolConfigurator(verify);
      if (!notFalsyOrZeroAddress(lendingPoolConfiguratorImplAddress)) {
        console.log('\tDeploying new configurator implementation...');
        const lendingPoolConfiguratorImpl = await deployLendingPoolConfigurator(verify);
        lendingPoolConfiguratorImplAddress = lendingPoolConfiguratorImpl.address;
      }
      console.log(
        '\tSetting lending pool configurator implementation with address:',
        lendingPoolConfiguratorImplAddress
      );
      // Set lending pool conf impl to Address Provider
      await waitForTx(
        await addressesProvider.setLendingPoolConfiguratorImpl(lendingPoolConfiguratorImplAddress)
      );

      console.log('111111111');
      const lendingPoolConfiguratorProxy = await getLendingPoolConfiguratorProxy(
        await addressesProvider.getLendingPoolConfigurator()
      );

      console.log('222222222');
      await insertContractAddressInDb(
        eContractid.LendingPoolConfigurator,
        lendingPoolConfiguratorProxy.address
      );
      const admin = await DRE.ethers.getSigner(await getEmergencyAdmin(poolConfig));
      console.log('33333333333');
      // Pause market during deployment
      await waitForTx(await lendingPoolConfiguratorProxy.connect(admin).setPoolPause(true));

      console.log('44444444444');
      // Deploy deployment helpers
      await deployStableAndVariableTokensHelper(
        [lendingPoolProxy.address, addressesProvider.address],
        verify
      );
      await deployATokensAndRatesHelper(
        [lendingPoolProxy.address, addressesProvider.address, lendingPoolConfiguratorProxy.address],
        verify
      );
      await deployATokenImplementations(pool, poolConfig.ReservesConfig, verify);
    } catch (error) {
      if (DRE.network.name.includes('tenderly')) {
        const transactionLink = `https://dashboard.tenderly.co/${DRE.config.tenderly.username}/${
          DRE.config.tenderly.project
        }/fork/${DRE.tenderly.network().getFork()}/simulation/${DRE.tenderly.network().getHead()}`;
        console.error('Check tx error:', transactionLink);
      }
      throw error;
    }
  });

/**
 * 1_address_provider
 * 1. ??????provider??????
 * 2. ??????????????????registry?????????????????????registry??????????????????provider???
 * 3. ??????admain????????????????????????0??????
 * 2_lending_pool
 * 1. ??????lendingPool?????????initialize(provider)
 * 2. provider??????setLendingPoolImpl(lendingPool)
 * 3. ?????????poolConfig???deployLendingPoolConfigurator
 * 4. provider??????setLendingPoolConfiguratorImpl(poolConfig)
 * 5. ?????? poolConfig ??????market??????
 * ????????????helpers:
 * 6. deployStableAndVariableTokensHelper(lendingPoolProxy, addressesProvider)
 * 7. deployATokensAndRatesHelper(lendingPoolProxy, addressesProvider)
 * 8. deployATokenImplementations
 * **/
