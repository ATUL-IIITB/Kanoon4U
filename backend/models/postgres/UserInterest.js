const { DataTypes } = require('sequelize');
const { sequelize } = require('../../config/postgres');

const UserInterest = sequelize.define(
  'UserInterest',
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    tag: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    interactionCount: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
      allowNull: false,
    },
    lastInteractedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: 'user_interests',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['userId', 'tag'] },
      { fields: ['userId', 'interactionCount'] },
      { fields: ['userId', 'lastInteractedAt'] },
    ],
  }
);

UserInterest.sync({ alter: true }).catch(console.error);

module.exports = UserInterest;